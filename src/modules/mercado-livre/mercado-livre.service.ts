import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { and, eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { DbService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { SearchMercadoLivreDto } from './dto/search-mercado-livre.dto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const { products, marketplaceAccounts } = schema;

type MercadoLivreSearchItem = {
  id: string;
  title: string;
  price: string;
  link: string;
  thumbnail: string | null;
};

type MercadoLivreProductDetails = {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  permalink: string;
  affiliateLink: string | null;
  thumbnail: string | null;
  available_quantity?: number;
  installments?: {
    quantity: number;
    amount: number;
    rate: string;
  } | null;
  coupon?: string | null;
};

@Injectable()
export class MercadoLivreService {
  private readonly logger = new Logger(MercadoLivreService.name);
  private readonly mlApiUrl: string;
  private readonly mlUseMock: boolean;
  private readonly mlAffiliateTag: string | null;

  constructor(
    private readonly dbService: DbService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.mlApiUrl =
      this.configService.get<string>('ML_API_URL') ||
      'https://api.mercadolibre.com';
    this.mlUseMock =
      String(this.configService.get<string>('ML_USE_MOCK') || 'false') ===
      'true';
    this.mlAffiliateTag =
      this.configService.get<string>('ML_AFFILIATE_TAG') || null;
  }

  // 🎯 BUSCA AFILIADA (API PRIMEIRO + Scraping FALLBACK) ✅ COM LOGS DEBUG
  async searchProductsAfiliado(
    query: string,
  ): Promise<MercadoLivreProductDetails | null> {
    if (this.mlUseMock) {
      this.logger.log(`[MercadoLivre] mock habilitado para "${query}"`);

      const mockResult: MercadoLivreProductDetails = {
        id: 'MLB000000001',
        title: `Produto mock para ${query}`,
        price: 199.9,
        originalPrice: 249.9,
        permalink: 'https://www.mercadolivre.com.br/',
        affiliateLink: null,
        thumbnail: null,
        installments: null,
        coupon: null,
      };

      return mockResult;
    }

    try {
      this.logger.log(`[MercadoLivre] Buscando "${query}" via API oficial...`);

      const mlAccount =
        await this.dbService.db.query.marketplaceAccounts.findFirst({
          where: (table) => eq(table.platform, 'mercado_livre'),
        });

      if (!mlAccount) {
        this.logger.error(
          '[MercadoLivre] Conta não autorizada — faça o fluxo OAuth primeiro',
        );
        return null;
      }
      this.logger.debug(
        `[MercadoLivre] Token usado: ${mlAccount.accessToken.substring(0, 20)}...`,
      );
      this.logger.debug(
        `[MercadoLivre] Token completo: ${mlAccount.accessToken}`,
      );
      const searchResponse = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/products/search`, {
          params: {
            status: 'active',
            q: query,
            site_id: 'MLB',
            limit: 5,
          },
          timeout: 10000,
          headers: {
            Authorization: `Bearer ${mlAccount.accessToken}`,
          },
        }),
      );

      const results = searchResponse?.data?.results;

      if (!Array.isArray(results) || results.length === 0) {
        this.logger.warn(`[MercadoLivre] Nenhum resultado para "${query}"`);
        return null;
      }

      const bestMatch =
        results?.find(
          (item: any) =>
            item?.id &&
            item?.name &&
            item?.pictures?.length > 0 &&
            item?.status === 'active',
        ) ||
        results?.find(
          (item: any) => item?.id && item?.name && item?.pictures?.length > 0,
        ) ||
        results?.[0];

      if (!bestMatch?.id) {
        this.logger.warn(`[MercadoLivre] Resultado inválido para "${query}"`);
        return null;
      }

      const details = await this.fetchProductDetails(
        bestMatch.id,
        mlAccount.accessToken,
      );

      if (!details?.permalink) {
        this.logger.warn(
          `[MercadoLivre] Não foi possível obter detalhes do produto ${bestMatch.id}`,
        );
        return null;
      }

      const result: MercadoLivreProductDetails = {
        ...details,
        affiliateLink: null,
      };

      this.logger.log(
        `[MercadoLivre] ✅ Produto encontrado para "${query}": ${result.id}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[MercadoLivre] API falhou para "${query}": ${
          error instanceof Error ? error.message : 'Erro desconhecido'
        }`,
      );
      this.logger.error(
        `[MercadoLivre] Detalhes do erro: ${JSON.stringify(error?.response?.data)}`,
      );
      return null;
    }
  }
  // 🔗 LINK AFILIADO (PROVISÓRIO - SEMPRE RETORNA PERMALINK REAL)

  private normalizeThumbnail(thumbnail: string | null): string | null {
    if (!thumbnail) return null;

    if (thumbnail.startsWith('//')) {
      return `https:${thumbnail}`;
    }

    return thumbnail;
  }

  /** NOVO: Normaliza qualquer formato de preço brasileiro */

  // 📊 DETALHES COMPLETOS POR API
  async fetchProductDetails(
    productId: string,
    accessToken: string,
  ): Promise<MercadoLivreProductDetails | null> {
    try {
      const productResponse = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/products/${productId}`, {
          timeout: 8000,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      const item = productResponse.data;
      if (!item?.id || !item?.name) return null;

      let price = 0;
      let originalPrice: number | null = null;
      let permalink = `https://www.mercadolivre.com.br/p/${item.id}`;

      try {
        const itemsResponse = await firstValueFrom(
          this.httpService.get(`${this.mlApiUrl}/products/${productId}/items`, {
            params: { limit: 1 },
            timeout: 8000,
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        );
        const firstItem = itemsResponse?.data?.results?.[0];
        if (firstItem) {
          price = Number(firstItem.price);
          originalPrice = firstItem.original_price
            ? Number(firstItem.original_price)
            : null;
          permalink = firstItem.permalink || permalink;
        }
      } catch {
        this.logger.warn(
          `[MercadoLivre] Preço não encontrado para ${productId}, usando 0`,
        );
      }

      return {
        id: item.id,
        title: item.name,
        price,
        originalPrice,
        permalink,
        affiliateLink: null,
        thumbnail: item.pictures?.[0]?.url
          ? this.normalizeThumbnail(item.pictures[0].url)
          : null,
        installments: null,
        coupon: null,
      };
    } catch (error: any) {
      this.logger.warn(
        `[MercadoLivre] Detalhes ${productId} falhou: ${JSON.stringify(error?.response?.data || error?.message)}`,
      );
      return null;
    }
  }
  getAuthorizationUrl() {
    const clientId = this.configService.get<string>('ML_CLIENT_ID');
    const redirectUri = this.configService.get<string>('ML_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new BadRequestException(
        'ML_CLIENT_ID e ML_REDIRECT_URI são obrigatórios',
      );
    }

    const url = new URL('https://auth.mercadolibre.com/authorization');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);

    return url.toString();
  }

  async searchProducts(query: string) {
    const result = await this.searchProductsAfiliado(query);
    if (!result) return [];
    return [result];
  }
  async saveAuthorizedAccount(code: string) {
    const clientId = this.configService.get<string>('ML_CLIENT_ID');
    const clientSecret = this.configService.get<string>('ML_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('ML_REDIRECT_URI');
    const tokenUrl = this.configService.get<string>('ML_TOKEN_URL');

    if (!clientId || !clientSecret || !redirectUri || !tokenUrl) {
      throw new BadRequestException('Configurações do ML incompletas no .env');
    }

    const response = await firstValueFrom(
      this.httpService.post(tokenUrl, {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    );

    const data = response.data;

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    const [account] = await this.dbService.db
      .insert(marketplaceAccounts)
      .values({
        platform: 'mercado_livre',
        externalUserId: String(data.user_id),
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        tokenType: data.token_type,
        expiresIn: data.expires_in,
        scope: data.scope ?? null,
        redirectUri,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          marketplaceAccounts.platform,
          marketplaceAccounts.externalUserId,
        ],
        set: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          expiresIn: data.expires_in,
          expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    return { success: true, account };
  }

  async getMeFromDatabase() {
    throw new BadRequestException(
      'Consulta de conta autorizada temporariamente desabilitada nesta versão.',
    );
  }

  // SLUGFY PRIVADO
  private slugify(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
