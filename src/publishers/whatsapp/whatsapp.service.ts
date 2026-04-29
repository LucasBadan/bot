import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { BaileysService } from 'src/modules/baileys/baileys.service';

export type SendWhatsappTextInput = {
  to: string;
  text: string;
};

export type SendWhatsappTextResult = {
  success: boolean;
  messageId: string | null;
  raw?: unknown;
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly baileysService: BaileysService) {}

  async sendText(
    input: SendWhatsappTextInput,
  ): Promise<SendWhatsappTextResult> {
    if (!input.to?.trim()) {
      throw new BadRequestException('"to" is required');
    }

    if (!input.text?.trim()) {
      throw new BadRequestException('"text" is required');
    }

    try {
      await this.baileysService.sendText(input.to, input.text);

      return {
        success: true,
        messageId: null,
        raw: {
          provider: 'baileys',
          to: input.to,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp text: ${error?.message ?? error}`,
      );

      throw new InternalServerErrorException(
        error?.message || 'Failed to send WhatsApp text',
      );
    }
  }

  async sendImage(input: { to: string; imageUrl: string; caption?: string }) {
    if (!input.to?.trim()) {
      throw new BadRequestException('"to" is required');
    }

    if (!input.imageUrl?.trim()) {
      throw new BadRequestException('"imageUrl" is required');
    }

    try {
      await this.baileysService.sendImage(
        input.to,
        input.imageUrl,
        input.caption,
      );

      return {
        success: true,
        messageId: null,
        raw: {
          provider: 'baileys',
          to: input.to,
          imageUrl: input.imageUrl,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp image: ${error?.message ?? error}`,
      );

      throw new InternalServerErrorException(
        error?.message || 'Failed to send WhatsApp image',
      );
    }
  }

  async sendProductOffer(input: {
    to: string;
    product: {
      id?: string;
      title: string;
      price: string | number;
      link: string;
      thumbnail?: string | null;
    };
  }) {
    const message = [
      input.product.title,
      `Preço: R$ ${input.product.price}`,
      input.product.link,
    ].join('\n');

    this.logger.log(
      `Oferta ${input.product.id ?? 'sem-id'} enviada para ${input.to}`,
    );

    await this.baileysService.sendText(input.to, message);
  }
}
