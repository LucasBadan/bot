import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response as ExpressResponse } from 'express';
import { WhatsappService } from './whatsapp.service';
import { MercadoLivreService } from '../../modules/mercado-livre/mercado-livre.service';
import axios from 'axios';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly mercadoLivreService: MercadoLivreService,
    private readonly configService: ConfigService,
  ) {}

  @Post('test-send')
  async testSend(
    @Body()
    body: {
      to: string;
      text: string;
    },
  ) {
    const result = await this.whatsappService.sendText({
      to: body.to,
      text: body.text,
    });

    return {
      message: 'WhatsApp send request processed',
      result,
    };
  }

  @Post('test-offer')
  async testOffer(@Body() body: { to: string; query: string }) {
    if (!body?.to?.trim()) {
      throw new BadRequestException('Campo "to" é obrigatório');
    }

    if (!body?.query?.trim()) {
      throw new BadRequestException('Campo "query" é obrigatório');
    }

    const products = await this.mercadoLivreService.searchProducts(body.query);

    if (!products || products.length === 0) {
      return { message: 'Nenhum produto encontrado' };
    }

    const product = products[0];

    const result = await this.whatsappService.sendProductOffer({
      to: body.to,
      product: {
        ...product,
        link: product.permalink,
      },
    });

    return {
      message: '✅ Oferta enviada no WhatsApp',
      product,
      whatsappResult: result,
    };
  }

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: ExpressResponse,
  ) {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    }

    throw new ForbiddenException('Invalid verify token');
  }

  @Post('webhook')
  handleWebhook(@Body() body: any) {
    console.log('WEBHOOK BODY:');
    console.log(JSON.stringify(body, null, 2));
    return { received: true };
  }

  @Post('test-template')
  async testTemplate(@Body() body: any) {
    const apiUrl = this.configService.get<string>('WHATSAPP_API_URL');
    const apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const templateName = this.configService.get<string>(
      'WHATSAPP_TEMPLATE_NAME',
    );

    console.log('ENVIANDO TEMPLATE COM:', {
      apiUrl,
      apiVersion,
      phoneNumberId,
      hasToken: !!accessToken,
      templateName,
    });

    const payload = {
      messaging_product: 'whatsapp',
      to: body.to || '5517991054813',
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
      },
    };

    const response = await axios.post(
      `${apiUrl}/${apiVersion}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  }

  @Post('test-send-text')
  async testSendText(@Body() body: any) {
    const apiUrl = this.configService.get<string>('WHATSAPP_API_URL');
    const apiVersion = this.configService.get<string>('WHATSAPP_API_VERSION');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');

    console.log('ENVIANDO TEXTO COM:', {
      apiUrl,
      apiVersion,
      phoneNumberId,
      hasToken: !!accessToken,
    });

    const payload = {
      messaging_product: 'whatsapp',
      to: body.to,
      type: 'text',
      text: {
        body: body.message ?? 'Teste de mensagem livre',
      },
    };

    const response = await axios.post(
      `${apiUrl}/${apiVersion}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  }
}
