import { CacheModule, Module } from '@nestjs/common';
import { FlightsModule } from './flights/flights.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule.forRoot(), FlightsModule],
})
export class AppModule {}
