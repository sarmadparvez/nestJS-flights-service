import {
  CACHE_MANAGER,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom, retry } from 'rxjs';
import { FindAllFlightsDto } from './dto/find-all-flights.dto';
import { sources } from './sources';
import { Flight } from './entities/flight.entity';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';

/**
 * Regular expression for validating a url.
 */
const urlRegex =
  /^(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)(?::\d{2,5})?(?:[/?#]\S*)?$/i;
export const hotCachedFlights = 'hotCachedFlights'; // the key in cache for storing hot cache.
export const regularCachedFlights = 'regularCachedFlights'; // the key in cache for storing regular cache.
export const refreshCacheJob = 'refreshCache'; // the name of cron job which refreshes the cache.

@Injectable()
export class FlightsService implements OnModuleInit {
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * On module initialization set a cron job which fetches flights from sources.
   * The interval is set in the .env file in FLIGHTS_FETCH_CRON_PATTERN key.
   */
  onModuleInit(): void {
    // populate flights in cache
    this.refreshCache();
    // Set a Cron job for keeping the cache upto date. The cron interval is set in .env file.
    const cronPattern =
      this.configService.get('FLIGHTS_FETCH_CRON_PATTERN') || '0 */5 * * * *';
    const job = new CronJob(cronPattern, () => {
      /* istanbul ignore next */
      this.refreshCache();
    });
    this.schedulerRegistry.addCronJob(refreshCacheJob, job);
    job.start();
  }

  /**
   * Find all flights. The Flights are returned from the cache.
   */
  async findAll(): Promise<FindAllFlightsDto> {
    const flightsFromHotCache = await this.cacheManager.get<FindAllFlightsDto>(
      hotCachedFlights,
    );
    if (flightsFromHotCache) {
      Logger.log('Flights found in hot cache');
      // flights are available in hot cache
      return flightsFromHotCache;
    } else {
      // hot cache is expired, refresh the cache
      this.refreshCache();
    }
    // get flights from regular cache
    Logger.log('Flights found in regular cache');
    return this.cacheManager.get<FindAllFlightsDto>(regularCachedFlights);
  }

  /**
   * For all the sources defined in sources.ts, fetch the flights and store in cache.
   */
  async populateFlightsInCache(): Promise<void[]> {
    return Promise.all(
      sources.map((source) => this.populateFlightInCache(source)),
    );
  }

  /**
   * Given a list of {@link Flight}, remove duplicates from it
   * A flight is considered as duplicate of another flight if they both have same number of slices,
   * same flight_number and same departure_date_time_utc
   * @param flights flights list to remove duplicates from
   */
  static removeDuplicates(flights: Flight[]): Flight[] {
    const map = new Map(
      flights.map((flight) => {
        let key = '';
        flight.slices.forEach((slice) => {
          key += slice.flight_number.toString() + slice.departure_date_time_utc;
        });
        return [key, flight];
      }),
    );
    return [...map.values()];
  }

  /**
   * Given a flight source (endpoint), fetch flights from it using a http request.
   * @param endpoint the endpoint for fetching flights.
   */
  async populateFlightInCache(endpoint: string): Promise<void> {
    if (!urlRegex.test(endpoint)) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Invalid endpoint for flight source.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<FindAllFlightsDto>(endpoint).pipe(
          catchError((err) => {
            Logger.error(
              `error fetching flights from source ${endpoint}. Retrying now!`,
            );
            throw err;
          }),
          retry(3), // retry upto 3 times in case call fails
        ),
      );
      // store flights in cache
      await this.cacheManager.set<FindAllFlightsDto>(endpoint, response.data);
    } catch (err) {
      Logger.error(`failed to fetch flights from source ${endpoint}`);
      // the flight's endpoint is down (even after 3 retries). Remove its flights from cache because it is now expired.
      await this.cacheManager.del(endpoint);
    }
  }

  /**
   * Refresh flights in cache.
   * Note: Set hot cache expire time (HOT_CACHE_TTL_SEC) in .env file based on number of flight sources, because larger the number of flight sources,
   * it will take more time to fetch data from all of those.
   */
  async refreshCache(): Promise<void> {
    Logger.log('Refreshing Flights Cache');
    const mergedFlights: Flight[] = [];
    let uniqueFlights: Flight[] = [];
    const hotCacheTTL =
      this.configService.get<number>('HOT_CACHE_TTL_SEC') || 60;
    await this.populateFlightsInCache();

    // From here onwards we use the flights from cache.
    // combine flights from all sources.
    for (const source of sources) {
      const flightsResponse = await this.cacheManager.get<FindAllFlightsDto>(
        source,
      );
      if (flightsResponse) {
        mergedFlights.push(...flightsResponse.flights);
      }
    }
    // Remove duplicates to get unique flights.
    uniqueFlights = FlightsService.removeDuplicates(mergedFlights);
    // set unique flights in cache
    await Promise.all([
      this.cacheManager.set<FindAllFlightsDto>(
        hotCachedFlights,
        <FindAllFlightsDto>{
          flights: uniqueFlights,
        },
        { ttl: hotCacheTTL },
      ),
      this.cacheManager.set<FindAllFlightsDto>(regularCachedFlights, <
        FindAllFlightsDto
      >{
        flights: uniqueFlights,
      }),
    ]);
  }
}
