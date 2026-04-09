import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { MercadoLivreService } from './mercado-livre.service';

@Controller('mercado-livre')
export class MercadoLivreController {
  constructor(private readonly mercadoLivreService: MercadoLivreService) {}

  @Get('auth/url')
  getAuthUrl() {
    return {
      url: this.mercadoLivreService.getAuthorizationUrl(),
    };
  }
  @Get('search')
  async searchProducts(@Query('q') query: string) {
    return this.mercadoLivreService.searchProducts(query);
  }

  @Get('auth/callback')
  async authCallback(@Query('code') code?: string) {
    if (!code) throw new BadRequestException('Code não recebido');

    const saved = await this.mercadoLivreService.saveAuthorizedAccount(code);

    return {
      message: 'Autenticação realizada com sucesso',
      account: saved.account,
    };
  }
  @Get('me')
  async getMe() {
    const me = await this.mercadoLivreService.getMeFromDatabase();

    return {
      message: 'Conta autenticada encontrada com sucesso',
      me,
    };
  }
}
