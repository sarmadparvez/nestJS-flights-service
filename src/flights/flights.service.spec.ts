import { Test, TestingModule } from '@nestjs/testing';
import {
  FlightsService,
  hotCachedFlights,
  refreshCacheJob,
  regularCachedFlights,
} from './flights.service';
import { createMock } from '@golevelup/ts-jest';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER, CacheModule } from '@nestjs/common';
import {
  duolicateFlightsDataSet,
  uniqueFlightsDataSet,
} from './tests-dataprovider';
import { sources } from './sources';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { FindAllFlightsDto } from './dto/find-all-flights.dto';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import exp from 'constants';
import { CronJob } from 'cron';

describe('FlightsService', () => {
  let service: FlightsService;
  let cacheManager: Cache;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FlightsService],
    })
      .useMocker(() => createMock())
      .compile();

    service = module.get<FlightsService>(FlightsService);
    cacheManager = module.get<Cache>(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return flights from hot cache', async () => {
      const result = Promise.resolve(uniqueFlightsDataSet);
      const getFromCache = jest
        .spyOn(cacheManager, 'get')
        .mockImplementation(() => result);
      expect(await service.findAll()).toBe(await result);
      expect(getFromCache).toHaveBeenCalledTimes(1);
      expect(getFromCache).toHaveBeenLastCalledWith(hotCachedFlights);
    });

    it('should return flights from regular cache', async () => {
      const result = Promise.resolve(uniqueFlightsDataSet);
      const getFromCache = jest
        .spyOn(cacheManager, 'get')
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => result);
      const refreshCache = jest
        .spyOn(service, 'refreshCache')
        .mockImplementation();
      expect(await service.findAll()).toBe(await result);
      expect(refreshCache).toHaveBeenCalledTimes(1);
      expect(getFromCache).toHaveBeenCalledTimes(2);
      expect(getFromCache).toHaveBeenCalledWith(hotCachedFlights);
      expect(getFromCache).toHaveBeenLastCalledWith(regularCachedFlights);
    });
  });

  describe('removeDuplicates', () => {
    it('should remove duplicate flights', () => {
      expect(
        FlightsService.removeDuplicates(duolicateFlightsDataSet.flights),
      ).toStrictEqual(uniqueFlightsDataSet.flights);
    });
  });

  describe('refreshCache', () => {
    let configService: ConfigService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          CacheModule.register({
            ttl: 0, // cache never expires by default
          }),
        ],
        providers: [FlightsService],
      })
        .useMocker((token) => createMock())
        .compile();

      service = module.get<FlightsService>(FlightsService);
      configService = module.get<ConfigService>(ConfigService);
      cacheManager = module.get<Cache>(CACHE_MANAGER);
    });

    afterEach(() => {
      // removed cached flights
      cacheManager.del(hotCachedFlights);
      cacheManager.del(regularCachedFlights);
    });

    test.each([10, undefined])(
      'should update the flights in cache',
      async (HOT_CACHE_TTL_SEC) => {
        jest
          .spyOn(configService, 'get')
          .mockImplementation(() => HOT_CACHE_TTL_SEC);
        const populateFlightsInCache = jest
          .spyOn(service, 'populateFlightsInCache')
          .mockImplementation();
        const getFromCache = jest.spyOn(cacheManager, 'get');

        // For each flight source return a mocked duplicate flights
        sources.forEach((s) =>
          getFromCache.mockImplementationOnce(() =>
            Promise.resolve(duolicateFlightsDataSet),
          ),
        );
        await service.refreshCache();
        expect(populateFlightsInCache).toHaveBeenCalledTimes(1);
        expect(getFromCache).toHaveBeenCalledTimes(sources.length);
        expect(await cacheManager.get(hotCachedFlights)).toStrictEqual(
          uniqueFlightsDataSet,
        );
      },
    );
  });

  describe('populateFlightsInCache', () => {
    it('should call populateFlightInCache for each flight source', async () => {
      const populateFlightInCache = jest
        .spyOn(service, 'populateFlightInCache')
        .mockImplementation();
      expect(sources.length).toBeGreaterThan(0);
      await service.populateFlightsInCache();
      expect(populateFlightInCache).toHaveBeenCalledTimes(sources.length);
    });
  });

  describe('populateFlightInCache', () => {
    let httpService: HttpService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          CacheModule.register({
            ttl: 0, // cache never expires by default
          }),
        ],
        providers: [FlightsService],
      })
        .useMocker((token) => createMock())
        .compile();

      service = module.get<FlightsService>(FlightsService);
      cacheManager = module.get<Cache>(CACHE_MANAGER);
      httpService = module.get<HttpService>(HttpService);
    });

    afterEach(() => {
      // removed cached flights
      sources.forEach((source) => cacheManager.del(source));
    });

    it('should set flights in cache from an external source', async () => {
      const response: AxiosResponse<FindAllFlightsDto> = <AxiosResponse>{
        data: duolicateFlightsDataSet,
      };
      const httpGet = jest
        .spyOn(httpService, 'get')
        .mockImplementation(() => of(response));
      expect(sources.length).toBeGreaterThan(0);
      await service.populateFlightInCache(sources[0]);
      expect(httpGet).toHaveBeenCalledTimes(1);
      expect(await cacheManager.get(sources[0])).toStrictEqual(
        duolicateFlightsDataSet,
      );
    });

    it('should throw exception due to invalid source endpoint url', async () => {
      await expect(
        async () => await service.populateFlightInCache(''),
      ).rejects.toThrow();
    });

    it('flights in cache should be undefined when flights source endpoint is down', async () => {
      const response: AxiosResponse<FindAllFlightsDto> = <AxiosResponse>{
        data: duolicateFlightsDataSet,
      };
      const httpGet = jest
        .spyOn(httpService, 'get')
        .mockImplementation(() => throwError(() => new Error()));
      expect(sources.length).toBeGreaterThan(0);
      await service.populateFlightInCache(sources[0]);
      expect(httpGet).toHaveBeenCalledTimes(1);
      expect(await cacheManager.get(sources[0])).toBe(undefined);
    });
  });

  describe('onModuleInit', () => {
    let configService: ConfigService;
    let schedulerRegistry: SchedulerRegistry;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [ScheduleModule.forRoot()],
        providers: [FlightsService],
      })
        .useMocker((token) => createMock())
        .compile();

      service = module.get<FlightsService>(FlightsService);
      schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
      configService = module.get<ConfigService>(ConfigService);
    });

    // Delete cron job created by Test.
    afterEach(() => schedulerRegistry.deleteCronJob(refreshCacheJob));
    test.each(['0 */5 * * * *', undefined])(
      'should set a cron job for fetching flights',
      async (FLIGHTS_FETCH_CRON_PATTERN) => {
        jest
          .spyOn(configService, 'get')
          .mockImplementation(() => FLIGHTS_FETCH_CRON_PATTERN);

        service.onModuleInit();
        expect(schedulerRegistry.getCronJob(refreshCacheJob)).toBeInstanceOf(
          CronJob,
        );
      },
    );
  });
});
