import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhapiService } from './whapi.service';
@Controller('whapi')
export class WhapiController {
  private readonly groupId: string;

  constructor(
    private readonly whapiService: WhapiService,
    private readonly configService: ConfigService,
  ) {
    this.groupId =
      this.configService.get<string>('WHAPI_DEFAULT_GROUP_ID') || '';
  }

  @Post('webhook')
  handleWebhook(@Body() body: any) {
    // Só loga mensagens do grupo configurado
    if (!this.groupId) return { received: true };

    const messages = body.messages || [];
    for (const message of messages) {
      if (message.chat_id === this.groupId) {
        console.log('================ WHAPI - GRUPO OFERTAS ================');
        console.dir(message, { depth: null });
        console.log('======================================================');
        break;
      }
    }

    return { received: true };
  }

  @Get('chats')
  async getChats() {
    return this.whapiService.getChats();
  }

  @Get('groups')
  async getGroups() {
    return this.whapiService.getGroups();
  }

  @Post('test-send')
  async testSend(
    @Body()
    payload: {
      to?: string;
      body: string;
    },
  ) {
    const to = payload.to || this.groupId;

    if (!to) {
      return {
        success: false,
        message:
          'Informe "to" no body ou configure WHAPI_DEFAULT_GROUP_ID no .env',
      };
    }

    return this.whapiService.sendText(to, payload.body);
  }

  @Post('test-image')
  async testImage(
    @Body()
    payload: {
      to?: string;
      imageUrl: string;
      caption?: string;
    },
  ) {
    const to = payload.to || this.groupId;

    return this.whapiService.sendImage(to, payload.imageUrl, payload.caption);
  }
}
