import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { MercadoLivreModule } from '../../modules/mercado-livre/mercado-livre.module';
import { BaileysModule } from '../../modules/baileys/baileys.module';

@Module({
  imports: [HttpModule, MercadoLivreModule, BaileysModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
