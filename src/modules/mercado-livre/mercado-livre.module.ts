import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MercadoLivreController } from './mercado-livre.controller';
import { MercadoLivreService } from './mercado-livre.service';
@Module({
  imports: [HttpModule],
  controllers: [MercadoLivreController],
  providers: [MercadoLivreService],
  exports: [MercadoLivreService],
})
export class MercadoLivreModule {}
