import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MercadoLivreModule } from '../modules/mercado-livre/mercado-livre.module';
import { WhatsappModule } from '../publishers/whatsapp/whatsapp.module';
import { DbModule } from '../db/db.module';
import { QUEUE_NAME } from './queue.constants';
import { QueueProcessor } from './queue.processor';
import { QueueService } from './queue.service';
import { BaileysModule } from '../modules/baileys/baileys.module';
import { OfferMessageFormatterService } from './queue-offer-message-formatter-service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    }),
    DbModule,
    MercadoLivreModule,
    WhatsappModule,
    BaileysModule,
  ],
  providers: [QueueService, QueueProcessor, OfferMessageFormatterService],
  exports: [QueueService, OfferMessageFormatterService],
})
export class QueueModule {}
