import { Controller, Get, Query } from '@nestjs/common';
import { ShopeeService } from './shopee.service';

@Controller('test/shopee')
export class ShopeeTestController {
  constructor(private readonly shopeeService: ShopeeService) {}

  @Get('search')
  async search(@Query('q') q: string) {
    return this.shopeeService.searchProducts(q);
  }

  @Get('best')
  async best(@Query('q') q: string) {
    return this.shopeeService.getBestProduct(q);
  }

  @Get('message')
  async message(@Query('q') q: string) {
    const best = await this.shopeeService.getBestProduct(q);

    if (!best) {
      return { message: 'Nenhum produto encontrado' };
    }

    return {
      product: best,
      text: this.shopeeService.formatOfferMessage(best),
    };
  }
}
