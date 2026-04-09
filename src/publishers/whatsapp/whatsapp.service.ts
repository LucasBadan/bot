import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  SendWhatsappTextInput,
  SendWhatsappTextResult,
  WhatsappCloudMessageResponse,
} from './whatsapp.types';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private getConfig() {
    const baseUrl =
      this.configService.get<string>('WHATSAPP_API_URL') ||
      'https://graph.facebook.com';

    const version =
      this.configService.get<string>('WHATSAPP_API_VERSION') || 'v22.0';

    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );

    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');

    return {
      baseUrl,
      version,
      phoneNumberId,
      accessToken,
    };
  }

  async sendText(
    input: SendWhatsappTextInput,
  ): Promise<SendWhatsappTextResult> {
    if (!input.to?.trim()) {
      throw new BadRequestException('"to" is required');
    }

    if (!input.text?.trim()) {
      throw new BadRequestException('"text" is required');
    }

    const { baseUrl, version, phoneNumberId, accessToken } = this.getConfig();

    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        'WhatsApp provider not configured. Returning mock success.',
      );

      return {
        success: true,
        messageId: `mock-${Date.now()}`,
        raw: {
          mocked: true,
          to: input.to,
          text: input.text,
        },
      };
    }

    const url = `${baseUrl}/${version}/${phoneNumberId}/messages`;

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<WhatsappCloudMessageResponse>(
          url,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.to,
            type: 'text',
            text: {
              preview_url: false,
              body: input.text,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        success: true,
        messageId: data?.messages?.[0]?.id ?? null,
        raw: data,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp message: ${
          error?.response?.data
            ? JSON.stringify(error.response.data)
            : error.message
        }`,
      );

      throw new InternalServerErrorException(
        error?.response?.data || 'Failed to send WhatsApp message',
      );
    }
  }

  async sendProductOffer(input: {
    to: string;
    product: {
      id?: string;
      title: string;
      price: string | number; // Aceita number do ML API
      link: string;
      thumbnail?: string | null;
    };
  }) {
    const { baseUrl, version, phoneNumberId, accessToken } = this.getConfig();

    if (!phoneNumberId || !accessToken) {
      this.logger.warn('WhatsApp provider not configured. Returning mock.');
      return {
        success: true,
        messageId: `mock-offer-${Date.now()}`,
        raw: { mocked: true, to: input.to, product: input.product },
      };
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: input.to,
      type: 'template',
      template: {
        name:
          this.configService.get<string>('WHATSAPP_TEMPLATE_NAME') ||
          'ola_mund',
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: input.product.title.substring(0, 100),
              },
              {
                type: 'text',
                text: input.product.title.substring(0, 50),
              },
              {
                type: 'currency',
                currency: 'BRL',
                amount_1000: Math.round(+input.product.price * 1000),
              },
              {
                type: 'url',
                url: input.product.link,
              },
            ],
          },
        ],
      },
    };

    const url = `${baseUrl}/${version}/${phoneNumberId}/messages`;

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<WhatsappCloudMessageResponse>(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      this.logger.log(
        `✅ Oferta ${input.product.id || 'N/A'} enviada para ${input.to}`,
      );
      return {
        success: true,
        messageId: data?.messages?.[0]?.id ?? null,
        raw: data,
      };
    } catch (error: any) {
      this.logger.error(
        `❌ Erro oferta: ${JSON.stringify(error.response?.data || error.message)}`,
      );
      throw new InternalServerErrorException(
        error?.response?.data || 'Failed to send offer',
      );
    }
  }

  async sendTemplate(to: string): Promise<SendWhatsappTextResult> {
    if (!to?.trim()) {
      throw new BadRequestException('"to" is required');
    }

    const { baseUrl, version, phoneNumberId, accessToken } = this.getConfig();

    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        'WhatsApp provider not configured. Returning mock success.',
      );

      return {
        success: true,
        messageId: `mock-${Date.now()}`,
        raw: {
          mocked: true,
          to,
          template: 'ola_mund',
        },
      };
    }

    const url = `${baseUrl}/${version}/${phoneNumberId}/messages`;

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<WhatsappCloudMessageResponse>(
          url,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
              name: 'ola_mund',
              language: {
                code: 'en_US', // ou 'pt_BR' se disponível
              },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        success: true,
        messageId: data?.messages?.[0]?.id ?? null,
        raw: data,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp template: ${
          error?.response?.data
            ? JSON.stringify(error.response.data)
            : error.message
        }`,
      );

      throw new InternalServerErrorException(
        error?.response?.data || 'Failed to send WhatsApp template',
      );
    }
  }
}
