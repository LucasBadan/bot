import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ShopeeService } from './shopee.service';
import { ShopeeController } from './shopee.controller';
import { BaileysModule } from '../baileys/baileys.module';
import { ShopeeTestController } from './shopee-test.controller';

@Module({
  imports: [HttpModule, ConfigModule, BaileysModule],
  providers: [ShopeeService],
  controllers: [ShopeeController, ShopeeTestController],
  exports: [ShopeeService],
})
export class ShopeeModule {}
