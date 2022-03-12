# Flights Information

## Description

This Project is created using [Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

The Project exposes a GET endpoint `/flights` which fetches flights information from different sources defined in
[sources.ts](https://github.com/sarmadparvez/nestJS-flights-service/blob/main/src/flights/sources.ts).

### Problem
The flight source endpoints are not stable i.e, sometimes they have long response times (lasting a few seconds), and
sometimes they are not responsive at all. Also, there could be more source endpoints added in the future to get flights
information.  However, our `/flights` endpoint needs to return flights information with 
response time upto 1 second. Also, there could be duplicate flights because same flight returned by more than 1 source, so
our endpoint needs to merge flights from all sources and return unique flights.

### Solution
Because of the instability of flight sources and the scalability challenge, we introduce a caching mechanism which fetches
flights information from all sources before a user requests them and then returns the flights from cache whenever user requests our endpoint.

For caching we use [In-memory cache](https://docs.nestjs.com/techniques/caching) and introduce two types of cache which
are explained below. Furthermore there is a cron job which keeps the cache up to date. The cron job execution pattern is configurable via [FLIGHTS_FETCH_CRON_PATTERN](https://github.com/sarmadparvez/nestJS-flights-service/blob/ec854f10f7c8f7d25c568ca3259b1d75b3c2d3e1/.env) in .env file.

##### Hot Cache
This cache expires after a certain time configurable via [HOT_CACHE_TTL_SEC](https://github.com/sarmadparvez/nestJS-flights-service/blob/ec854f10f7c8f7d25c568ca3259b1d75b3c2d3e1/.env) in .env file.
When a user requests the flights information `/flights` and flights are available in hot cache they are returned from there. If the hot cache is expired, a request to refresh
the cache asynchronously is initiated and flights are returned from the Regular cache.

#### Regular Cache
This is a long-lived cache and does not expire automatically. However, this cache is deleted if the source endpoint becomes unresponsive i.e, it does not return flights any more even
after retrying for 3 additional times.

##### Cache update

Both type of caches explained above are updated/refreshed on the following events:
1. Whenever the cron job is executed.
2. Whenever a request is made our endpoint`/flights` AND the hot cache is in expired state at that time.

The solution explained above keeps the flights data up to date when there is traffic on our endpoint i.e by making
use of hot cache and refreshing the cache whenever hot cache is expired and a request for flights is made. If there is no traffic on our endpoint, then
the cache is updated regularly as per the interval defined for cron job execution. This means that higher the traffic
on our endpoint, higher is the freshness of data, however in worst case i.e, very low traffic or no traffic, the 
data is only as old as the interval defined for cron job execution.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## License

Nest is [MIT licensed](LICENSE).
