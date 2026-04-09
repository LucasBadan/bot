import { Controller, Post } from '@nestjs/common';
import { OffersMonitorService } from './offers-monitor.service';

@Controller('offers-monitor')
export class OffersMonitorController {
  constructor(private readonly offersMonitorService: OffersMonitorService) {}

  @Post('run')
  async run() {
    await this.offersMonitorService.monitorOffers();

    return { ok: true };
  }
}
