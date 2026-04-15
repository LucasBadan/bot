import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OffersMonitorController } from './offers-monitor-controller';
import { OffersMonitorService } from './offers-monitor.service';
import { MercadoLivreModule } from '../mercado-livre/mercado-livre.module';
import { WhatsappModule } from 'src/publishers/whatsapp/whatsapp.module';
import { DbModule } from 'src/db/db.module';
import { QueueModule } from 'src/queue/queue.module';
import { BaileysModule } from '../baileys/baileys.module';
@Module({
  imports: [
    ConfigModule,
    MercadoLivreModule,
    WhatsappModule,
    DbModule,
    QueueModule,
    BaileysModule,
  ],
  controllers: [OffersMonitorController],
  providers: [OffersMonitorService],
  exports: [OffersMonitorService],
})
export class OffersMonitorModule {}
