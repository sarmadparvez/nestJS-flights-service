import { CacheModule, Module } from '@nestjs/common';
import { FlightsService } from './flights.service';
import { FlightsController } from './flights.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    CacheModule.register({
      ttl: 0, // cache never expires by default
    }),
  ],
  controllers: [FlightsController],
  providers: [FlightsService],
})
export class FlightsModule {}
