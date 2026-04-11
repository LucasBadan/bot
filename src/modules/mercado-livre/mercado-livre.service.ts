import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { DbService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as cheerio from 'cheerio';

const { marketplaceAccounts } = schema;

type MercadoLivreProductDetails = {
  id: string;
  title: string;
  price: number;
  pixPrice?: number | null;
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

  async searchProductsAfiliado(
    query: string,
    mlProductId?: string,
  ): Promise<MercadoLivreProductDetails | null> {
    if (this.mlUseMock) return this.getMockProduct(query);

    try {
      const authHeader = await this.getAuthHeader();

      if (mlProductId) {
        return await this.fetchProductById(mlProductId, authHeader);
      }

      this.logger.warn(`[ML] Sem mlProductId para "${query}"`);
      return null;
    } catch (error: any) {
      this.logger.error(`[ML] Erro "${query}": ${error?.message}`);
      return null;
    }
  }

  async fetchProductById(
    productId: string,
    authHeader: Record<string, string>,
  ): Promise<MercadoLivreProductDetails | null> {
    try {
      // 1. Busca dados do produto (nome, imagem)
      const productResponse = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/products/${productId}`, {
          timeout: 10000,
          headers: authHeader,
        }),
      );

      const product = productResponse.data;
      if (!product?.id) return null;

      const thumbnail = product.pictures?.[0]?.url ?? null;
      const permalink = `https://www.mercadolivre.com.br/p/${product.id}`;

      let price = 0;
      let pixPrice: number | null = null;
      let originalPrice: number | null = null;
      let installments: {
        quantity: number;
        amount: number;
        rate: string;
      } | null = null;

      try {
        // 2. Busca itens do produto
        const priceResponse = await firstValueFrom(
          this.httpService.get(`${this.mlApiUrl}/products/${productId}/items`, {
            params: { limit: 20 },
            timeout: 8000,
            headers: authHeader,
          }),
        );

        const items: any[] = priceResponse?.data?.results ?? [];

        this.logger.debug(
          `[ML] ${items.length} itens encontrados para ${productId}`,
        );

        if (items.length > 0) {
          // Menor preço entre todos os vendedores
          const best = items.reduce((min: any, item: any) =>
            Number(item.price) < Number(min.price) ? item : min,
          );

          this.logger.log(
            `[ML] Item escolhido: ${best.item_id} | R$ ${best.price} | original: ${best.original_price}`,
          );

          // 3. Busca detalhes completos do item para pegar parcelas e preço Pix
          try {
            const itemResponse = await firstValueFrom(
              this.httpService.get(`${this.mlApiUrl}/items/${best.item_id}`, {
                timeout: 8000,
                // sem token - endpoint público
              }),
            );

            const itemDetail = itemResponse.data;

            this.logger.debug(
              `[ML] sale_price: ${JSON.stringify(itemDetail.sale_price)}`,
            );

            price = Number(itemDetail.price ?? best.price ?? 0);
            originalPrice = itemDetail.original_price
              ? Number(itemDetail.original_price)
              : null;

            if (itemDetail.sale_price?.amount) {
              pixPrice = Number(itemDetail.sale_price.amount);
              this.logger.log(`[ML] Preço Pix: R$ ${pixPrice}`);
            }

            installments = itemDetail.installments
              ? {
                  quantity: itemDetail.installments.quantity,
                  amount: itemDetail.installments.amount,
                  rate:
                    itemDetail.installments.rate === 0
                      ? 'sem juros'
                      : `${itemDetail.installments.rate}%`,
                }
              : null;

            this.logger.log(
              `[ML] Cartão: R$ ${price} | Pix: R$ ${pixPrice} | Parcelas: ${installments?.quantity}x R$ ${installments?.amount} ${installments?.rate}`,
            );
          } catch (error: any) {
            // ✅ LOG DETALHADO DO ERRO
            this.logger.warn(
              `[ML] /items/${best.item_id} falhou | status: ${error?.response?.status} | erro: ${JSON.stringify(error?.response?.data)}`,
            );
            // fallback com estimativa de parcelas
            price = Number(best.price ?? 0);
            originalPrice = best.original_price
              ? Number(best.original_price)
              : null;
            installments = {
              quantity: 10,
              amount: Math.round((price / 10) * 100) / 100,
              rate: 'sem juros',
            };
          }
        }
      } catch {
        this.logger.warn(`[ML] Não foi possível obter itens para ${productId}`);
      }

      // 4. Resolve link afiliado
      const affiliateLink = await this.buildAffiliateLinkShort(
        permalink,
        this.mlAffiliateTag,
      );

      this.logger.log(`[ML] ✅ ${product.name} - R$ ${price}`);

      return {
        id: product.id,
        title: product.name,
        price,
        pixPrice,
        originalPrice,
        permalink,
        affiliateLink,
        thumbnail: thumbnail ? this.normalizeThumbnail(thumbnail) : null,
        installments,
        coupon: null,
      };
    } catch (error: any) {
      this.logger.error(
        `[ML] fetchProductById ${productId}: ${JSON.stringify(
          error?.response?.data || error?.message,
        )}`,
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

  private async getAuthHeader(): Promise<Record<string, string>> {
    try {
      const account =
        await this.dbService.db.query.marketplaceAccounts.findFirst({
          where: (table) => eq(table.platform, 'mercado_livre'),
        });

      if (!account) return {};

      const isExpired =
        new Date(account.expiresAt).getTime() < Date.now() + 5 * 60 * 1000;

      if (isExpired && account.refreshToken) {
        const refreshed = await this.refreshToken(account);
        if (refreshed) return { Authorization: `Bearer ${refreshed}` };
        return {};
      }

      return account.accessToken
        ? { Authorization: `Bearer ${account.accessToken}` }
        : {};
    } catch {
      return {};
    }
  }

  private async refreshToken(account: any): Promise<string | null> {
    try {
      const clientId = this.configService.get<string>('ML_CLIENT_ID');
      const clientSecret = this.configService.get<string>('ML_CLIENT_SECRET');
      const tokenUrl = this.configService.get<string>('ML_TOKEN_URL');

      if (!clientId || !clientSecret || !tokenUrl) return null;

      const response = await firstValueFrom(
        this.httpService.post(tokenUrl, {
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: account.refreshToken,
        }),
      );

      const data = response.data;
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      await this.dbService.db
        .update(schema.marketplaceAccounts)
        .set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? account.refreshToken,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.marketplaceAccounts.id, account.id));

      this.logger.log('[ML] Token renovado com sucesso');
      return data.access_token;
    } catch (error: any) {
      this.logger.error(`[ML] Falha ao renovar token: ${error?.message}`);
      return null;
    }
  }

  private async shortenLink(url: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get('https://tinyurl.com/api-create.php', {
          params: { url },
          timeout: 5000,
        }),
      );
      return response.data as string;
    } catch (error: any) {
      this.logger.warn(
        `[TinyURL] Erro: ${error?.message} - status: ${error?.response?.status}`,
      );
      return url;
    }
  }

  async buildAffiliateLinkShort(
    permalink: string,
    tag: string | null,
  ): Promise<string | null> {
    if (!tag || !permalink) return null;
    try {
      const mattTool = this.configService.get<string>('ML_MATT_TOOL') ?? '';
      const url = new URL(permalink);
      url.searchParams.set('matt_word', tag);
      if (mattTool) url.searchParams.set('matt_tool', mattTool);

      const longLink = url.toString();
      const shortLink = await this.shortenLink(longLink);

      this.logger.log(`[ML] Link afiliado: ${shortLink}`);
      return shortLink;
    } catch {
      return null;
    }
  }

  private normalizeThumbnail(thumbnail: string | null): string | null {
    if (!thumbnail) return null;
    if (thumbnail.startsWith('//')) return `https:${thumbnail}`;
    return thumbnail;
  }

  private getMockProduct(query: string): MercadoLivreProductDetails {
    return {
      id: 'MLB000000001',
      title: `Produto mock para ${query}`,
      price: 199.9,
      pixPrice: 179.9,
      originalPrice: 249.9,
      permalink: 'https://www.mercadolivre.com.br/',
      affiliateLink: null,
      thumbnail: null,
      installments: { quantity: 10, amount: 19.99, rate: 'sem juros' },
      coupon: null,
    };
  }
}
