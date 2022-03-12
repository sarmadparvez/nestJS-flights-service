import { Test, TestingModule } from '@nestjs/testing';
import { FlightsController } from './flights.controller';
import { FlightsService } from './flights.service';
import { createMock } from '@golevelup/ts-jest';
import { uniqueFlightsDataSet } from './tests-dataprovider';

describe('FlightsController', () => {
  let controller: FlightsController;
  let service: FlightsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlightsController],
      providers: [FlightsService],
    })
      .useMocker(() => createMock())
      .compile();

    controller = module.get<FlightsController>(FlightsController);
    service = module.get<FlightsService>(FlightsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return flights', async () => {
      const result = Promise.resolve(uniqueFlightsDataSet);
      const findAll = jest
        .spyOn(service, 'findAll')
        .mockImplementation(() => result);
      expect(await controller.findAll()).toStrictEqual(await result);
      expect(findAll).toHaveBeenCalledTimes(1);
    });
  });
});
