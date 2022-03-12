import { Controller, Get } from '@nestjs/common';
import { FlightsService } from './flights.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('flights')
@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  /**
   * Get all flights.
   */
  @Get()
  findAll() {
    return this.flightsService.findAll();
  }
}
