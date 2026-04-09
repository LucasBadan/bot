import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WhapiService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService.get<string>('WHAPI_BASE_URL') ||
      'https://gate.whapi.cloud';
    this.token = this.configService.get<string>('WHAPI_TOKEN') || '';

    if (!this.token) {
      throw new Error('WHAPI_TOKEN não configurado no .env');
    }
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async sendText(to: string, body: string) {
    if (!to) {
      throw new BadRequestException('Destino "to" é obrigatório');
    }

    if (!body) {
      throw new BadRequestException('Texto da mensagem é obrigatório');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/messages/text`,
          { to, body },
          { headers: this.headers },
        ),
      );

      return response.data;
    } catch (error: any) {
      throw new InternalServerErrorException({
        message: 'Erro ao enviar mensagem pela Whapi',
        details: error?.response?.data || error?.message,
        status: error?.response?.status || null,
      });
    }
  }

  async sendImage(to: string, imageUrl: string, caption?: string) {
    if (!to) {
      throw new BadRequestException('Destino "to" é obrigatório');
    }

    if (!imageUrl) {
      throw new BadRequestException('URL da imagem é obrigatória');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/messages/image`,
          {
            to,
            media: imageUrl,
            caption,
          },
          {
            headers: this.headers,
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      throw new InternalServerErrorException({
        message: 'Erro ao enviar imagem pela Whapi',
        details: error?.response?.data || error?.message,
        status: error?.response?.status || null,
      });
    }
  }

  async getChats() {
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/chats`, {
        headers: this.headers,
      }),
    );

    return response.data;
  }

  async getGroups() {
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/groups`, {
        headers: this.headers,
      }),
    );

    return response.data;
  }
}
