import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [WhapiController],
  providers: [WhapiService],
  exports: [WhapiService],
})
export class WhapiModule {}
