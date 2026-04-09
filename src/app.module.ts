import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from './db/db.module';
import { MercadoLivreModule } from './modules/mercado-livre/mercado-livre.module';
import { QueueModule } from './queue/queue.module';
import { WhatsappModule } from './publishers/whatsapp/whatsapp.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { PostsModule } from './modules/posts/posts.module';
import { OffersMonitorModule } from './modules/offers-monitor/offers-monitor.module';
import { WhapiModule } from './modules/whapi/whapi.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: '127.0.0.1',
        port: 6379,
      },
    }),
    DbModule,
    MercadoLivreModule,
    QueueModule,
    WhatsappModule,
    ChannelsModule,
    PostsModule,
    OffersMonitorModule,
    WhapiModule,
  ],
})
export class AppModule {}
