import { Module } from '@nestjs/common';
import { BaileysService } from './baileys.service';
import { BaileysController } from '../baileys/baileys.controller';

@Module({
  providers: [BaileysService],
  controllers: [BaileysController],
  exports: [BaileysService],
})
export class BaileysModule {}
