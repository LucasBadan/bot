import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopeeService } from './shopee.service';
import { BaileysService } from '../baileys/baileys.service';
import { SendShopeeOfferDto } from '../shopee/send-shopee-offer.dto';

@Controller('shopee')
export class ShopeeController {
  constructor(
    private readonly shopeeService: ShopeeService,
    private readonly baileysService: BaileysService,
    private readonly configService: ConfigService,
  ) {}

  @Get('search')
  async search(@Query('keyword') keyword?: string) {
    const term = keyword?.trim();

    if (!term) {
      throw new BadRequestException('keyword é obrigatório');
    }

    const products = await this.shopeeService.searchProducts(term);
    const bestProduct = await this.shopeeService.getBestProduct(term);

    return {
      success: true,
      keyword: term,
      total: products.length,
      bestProduct,
      previewMessage: bestProduct
        ? this.shopeeService.formatOfferMessage(bestProduct)
        : null,
      products,
    };
  }

  @Post('send-offer')
  @HttpCode(HttpStatus.OK)
  async sendOffer(@Body() body: SendShopeeOfferDto) {
    const keyword = body.keyword.trim();
    const groupId =
      body.groupId?.trim() ||
      this.configService.get<string>('WHATSAPP_GROUP_ID', '');

    if (!groupId) {
      throw new BadRequestException('WHATSAPP_GROUP_ID não configurado');
    }

    const product = await this.shopeeService.getBestProduct(keyword);

    if (!product) {
      return {
        success: false,
        keyword,
        message: 'Nenhum produto encontrado na Shopee',
      };
    }

    const message = this.shopeeService.formatOfferMessage(product);
    const sendResult = await this.baileysService.sendText(groupId, message);

    return {
      success: true,
      keyword,
      groupId,
      product,
      message,
      sendResult,
    };
  }
}
