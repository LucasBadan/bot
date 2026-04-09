import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OffersMonitorController } from './offers-monitor-controller';
import { OffersMonitorService } from './offers-monitor.service';
import { MercadoLivreModule } from '../mercado-livre/mercado-livre.module';
import { WhapiModule } from '../whapi/whapi.module';

@Module({
  imports: [ConfigModule, MercadoLivreModule, WhapiModule],
  controllers: [OffersMonitorController],
  providers: [OffersMonitorService],
  exports: [OffersMonitorService],
})
export class OffersMonitorModule {}
