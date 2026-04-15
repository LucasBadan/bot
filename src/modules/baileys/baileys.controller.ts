import { Controller, Get, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as qrcode from 'qrcode';
import { BaileysService } from './baileys.service';

@Controller('baileys')
export class BaileysController {
  constructor(private readonly baileysService: BaileysService) {}

  @Get('qrcode')
  async getQrCode(@Res() res: Response) {
    const qr = this.baileysService.getQrCode();

    if (!qr) {
      return res.status(200).json({
        connected: this.baileysService.isReady(),
        message: this.baileysService.isReady()
          ? 'Já conectado!'
          : 'QR Code ainda não gerado, aguarde...',
      });
    }

    const qrImageBuffer = await qrcode.toBuffer(qr);
    res.setHeader('Content-Type', 'image/png');
    return res.send(qrImageBuffer);
  }

  @Get('status')
  getStatus() {
    return {
      connected: this.baileysService.isReady(),
    };
  }

  @Get('groups')
  async getGroups() {
    const groups = await this.baileysService.getGroups();
    return {
      total: groups.length,
      groups: groups.map((g: any) => ({
        id: g.id,
        name: g.subject,
        participants: g.participants?.length,
      })),
    };
  }

  @Post('test-send')
  async testSend(@Body() body: { groupId: string; message: string }) {
    await this.baileysService.sendText(body.groupId, body.message);
    return { success: true };
  }
}
