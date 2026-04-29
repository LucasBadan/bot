import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { MarketplaceProductDetails } from 'src/modules/marketplace/marketplace.types';
import axios from 'axios';

const marketplaceAccounts = schema.marketplaceAccounts;

type MlProbeEntry = {
  label: string;
  url: string;
  ok: boolean;
  status: number | null;
  data: unknown;
  error: {
    message: string | null;
    code: string | null;
    blockedBy: string | null;
  } | null;
};

type MlProbeResult = {
  itemId: string;
  withToken: MlProbeEntry[];
  withoutToken: MlProbeEntry[];
};

type MlInstallments = {
  quantity?: number | string;
  amount?: number | string;
  rate?: number | string | null;
};

type MlItem = {
  id?: string;
  item_id?: string;
  title?: string;
  price?: number | string;
  original_price?: number | string | null;
  permalink?: string;
  thumbnail?: string | null;
  pictures?: { url?: string }[];
  installments?: MlInstallments | null;
  installment?: MlInstallments | null;
};

type MlProduct = {
  id?: string;
  name?: string;
  title?: string;
  permalink?: string;
  thumbnail?: string | null;
  pictures?: { url?: string }[];
};

type MarketplaceAccountRow = {
  id: string;
  platform: string;
  externalUserId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date;
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
      this.configService.get<string>('ML_API_URL') ??
      'https://api.mercadolibre.com';

    this.mlUseMock =
      (this.configService.get<string>('ML_USE_MOCK') ?? 'false') === 'true';

    this.mlAffiliateTag =
      this.configService.get<string>('ML_AFFILIATE_TAG') ?? null;
  }

  async searchProductsAfiliado(
    query: string,
    mlProductId?: string,
    mlItemId?: string,
  ): Promise<MarketplaceProductDetails | null> {
    if (this.mlUseMock) {
      return this.getMockProduct(query);
    }

    try {
      const authHeader = await this.getAuthHeader();

      this.logger.debug(
        `ML auth header presente: ${Boolean(authHeader?.Authorization)}`,
      );

      if (mlItemId) {
        const item = await this.fetchItemById(mlItemId, authHeader);
        if (item) return item;

        this.logger.warn(
          `ML itemId ${mlItemId} falhou; tentando fallback por busca "${query}"`,
        );
      }

      if (mlProductId) {
        const product = await this.fetchProductById(mlProductId, authHeader);
        if (product) return product;

        this.logger.warn(
          `ML productId ${mlProductId} falhou; tentando fallback por busca "${query}"`,
        );
      }

      const results = await this.searchProducts(query);
      if (results.length) {
        this.logger.log(
          `ML fallback search encontrou ${results.length} resultado(s) para "${query}"`,
        );
        return results[0];
      }

      this.logger.warn(`ML sem resultados para query "${query}"`);
      return null;
    } catch (error: any) {
      this.logger.error(`ML Erro "${query}": ${error?.message}`);
      return null;
    }
  }

  private async fetchSalePrice(
    itemId: string,
    authHeader?: Record<string, string>,
  ): Promise<{
    price: number | null;
    originalPrice: number | null;
  } | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/items/${itemId}/sale_price`, {
          params: {
            context: 'channel_marketplace',
          },
          timeout: 10000,
          ...(authHeader ? { headers: authHeader } : {}),
        }),
      );

      const data = response?.data ?? {};

      const price =
        Number(data.amount ?? data.price ?? data.sale_price?.amount ?? 0) ||
        null;

      const rawOriginal =
        data.regular_amount ??
        data.original_price ??
        data.sale_price?.regular_amount ??
        null;

      const originalPrice =
        rawOriginal != null &&
        Number(rawOriginal) > 0 &&
        Number(rawOriginal) > Number(price ?? 0)
          ? Number(rawOriginal)
          : null;

      this.logger.debug(
        `[ML SALE PRICE] ${JSON.stringify({
          itemId,
          amount: data.amount ?? data.price ?? null,
          regular_amount: data.regular_amount ?? data.original_price ?? null,
        })}`,
      );

      return {
        price,
        originalPrice,
      };
    } catch (error: any) {
      this.logger.warn(
        `ML sale_price ${itemId} falhou | status=${error?.response?.status ?? 'N/A'} | erro=${JSON.stringify(error?.response?.data ?? error?.message ?? error)}`,
      );
      return null;
    }
  }

  async fetchProductById(
    productId: string,
    authHeader: Record<string, string>,
  ): Promise<MarketplaceProductDetails | null> {
    try {
      const productResponse = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/products/${productId}`, {
          timeout: 10000,
          headers: authHeader,
        }),
      );

      const product = (productResponse.data ?? {}) as MlProduct;

      if (!product?.id) {
        this.logger.warn(`ML Produto ${productId} não encontrado em /products`);
        return null;
      }

      const thumbnail =
        product?.pictures?.[0]?.url ?? product?.thumbnail ?? null;

      const productPermalink =
        typeof product?.permalink === 'string' ? product.permalink.trim() : '';

      const itemsResponse = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/products/${productId}/items`, {
          params: { limit: 20 },
          timeout: 10000,
          headers: authHeader,
        }),
      );

      const itemsRaw = itemsResponse?.data;
      const items: MlItem[] = Array.isArray(itemsRaw)
        ? itemsRaw
        : Array.isArray(itemsRaw?.results)
          ? itemsRaw.results
          : [];

      this.logger.debug(
        `ML ${items.length} itens encontrados para ${productId}`,
      );

      if (!items.length) {
        this.logger.warn(`ML Produto ${productId} sem itens`);
        return null;
      }

      const pricedItems = items.filter((item) => Number(item?.price ?? 0) > 0);

      if (!pricedItems.length) {
        this.logger.warn(`ML Produto ${productId} sem itens com preço válido`);
        return null;
      }

      const best = pricedItems.sort((a, b) => {
        const priceA = Number(a?.price ?? 0);
        const priceB = Number(b?.price ?? 0);

        const originalA = Number(a?.original_price ?? 0);
        const originalB = Number(b?.original_price ?? 0);

        const discountA =
          originalA > priceA ? (originalA - priceA) / originalA : 0;
        const discountB =
          originalB > priceB ? (originalB - priceB) / originalB : 0;

        if (discountB !== discountA) {
          return discountB - discountA;
        }

        return priceA - priceB;
      })[0];

      const itemId = String(best?.item_id ?? best?.id ?? '').trim();

      if (itemId) {
        await this.debugItemPricingEndpoints(itemId, authHeader);
      }

      let price = 0;
      let originalPrice: number | null = null;

      if (itemId) {
        const salePriceData = await this.fetchSalePrice(itemId, authHeader);

        if (salePriceData?.price && Number.isFinite(salePriceData.price)) {
          price = salePriceData.price;
          originalPrice = salePriceData.originalPrice;
        }
      }

      if (!price) {
        price = Number(best?.price ?? 0);
        originalPrice =
          best?.original_price != null && Number(best.original_price) > price
            ? Number(best.original_price)
            : null;
      }

      if (!price || Number.isNaN(price)) {
        this.logger.warn(`ML Produto ${productId} sem preço final válido`);
        return null;
      }

      const installmentsRaw = best?.installments ?? best?.installment ?? null;

      const installments =
        installmentsRaw?.quantity && installmentsRaw?.amount
          ? {
              quantity: Number(installmentsRaw.quantity),
              amount: Number(installmentsRaw.amount),
              rate:
                Number(installmentsRaw.rate ?? 0) === 0
                  ? 'sem juros'
                  : installmentsRaw.rate != null
                    ? String(installmentsRaw.rate)
                    : null,
            }
          : null;

      const permalink =
        (typeof best?.permalink === 'string' && best.permalink.trim()) ||
        (typeof product?.permalink === 'string' && product.permalink.trim()) ||
        productPermalink ||
        `https://www.mercadolivre.com.br/p/${product.id}`;

      let affiliateLink = permalink;

      if (permalink) {
        try {
          affiliateLink =
            (await this.buildAffiliateLinkShort(
              permalink,
              this.mlAffiliateTag,
            )) || permalink;
        } catch (error: any) {
          this.logger.warn(
            `ML buildAffiliateLinkShort falhou: ${error?.message ?? error}`,
          );
          affiliateLink = permalink;
        }
      }

      const result: MarketplaceProductDetails = {
        platform: 'mercado_livre',
        id: String(product.id),
        title: product?.name ?? product?.title ?? 'Produto sem título',
        price,
        originalPrice,
        pixPrice: null,
        permalink,
        affiliateLink,
        installments,
        thumbnail,
        coupon: null,
      };

      this.logger.log(
        `ML ${result.title} | item ${itemId || 'N/A'} | preço=${result.price} | à vista=${result.pixPrice ?? 'N/A'} | parcelas=${result.installments?.quantity ?? 0}`,
      );

      return result;
    } catch (error: any) {
      this.logger.warn(
        `ML fetchProductById ${productId} falhou | status=${error?.response?.status ?? 'N/A'} | erro=${JSON.stringify(error?.response?.data ?? error?.message ?? error)}`,
      );
      return null;
    }
  }

  async fetchItemById(
    itemId: string,
    authHeader?: Record<string, string>,
  ): Promise<MarketplaceProductDetails | null> {
    try {
      const itemResponse = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/items/${itemId}`, {
          timeout: 10000,
          ...(authHeader ? { headers: authHeader } : {}),
        }),
      );

      const item = (itemResponse.data ?? {}) as MlItem;

      this.logger.debug(`[ML ITEM ID] ${JSON.stringify(itemId)}`);
      this.logger.debug(`[ML ITEM RAW] ${JSON.stringify(item)}`);

      if (!item?.id) return null;

      const salePriceData = await this.fetchSalePrice(
        String(item.id),
        authHeader,
      );

      const price =
        salePriceData?.price && Number.isFinite(salePriceData.price)
          ? salePriceData.price
          : Number(item?.price ?? 0);

      if (!price || Number.isNaN(price)) {
        return null;
      }

      let originalPrice =
        salePriceData?.originalPrice ??
        (item?.original_price != null ? Number(item.original_price) : null);

      if (originalPrice != null && originalPrice <= price) {
        originalPrice = null;
      }

      const installments =
        item?.installments?.quantity && item?.installments?.amount
          ? {
              quantity: Number(item.installments.quantity),
              amount: Number(item.installments.amount),
              rate:
                item.installments.rate === 0
                  ? 'sem juros'
                  : item.installments.rate != null
                    ? String(item.installments.rate)
                    : null,
            }
          : null;

      const permalink =
        (typeof item?.permalink === 'string' && item.permalink.trim()) ||
        `https://www.mercadolivre.com.br/p/${item.id}`;

      let affiliateLink = permalink;

      try {
        affiliateLink =
          (await this.buildAffiliateLinkShort(
            permalink,
            this.mlAffiliateTag,
          )) || permalink;
      } catch (error: any) {
        this.logger.warn(
          `ML buildAffiliateLinkShort falhou: ${error?.message ?? error}`,
        );
        affiliateLink = permalink;
      }

      return {
        platform: 'mercado_livre',
        id: String(item.id),
        title: item.title ?? 'Produto sem título',
        price,
        pixPrice: null,
        originalPrice,
        permalink,
        affiliateLink,
        thumbnail: item.thumbnail
          ? this.normalizeThumbnail(item.thumbnail)
          : null,
        installments,
        coupon: null,
      };
    } catch (error: any) {
      this.logger.error(
        `ML fetchItemById ${itemId}: ${JSON.stringify(
          error?.response?.data ?? error?.message,
        )}`,
      );
      return null;
    }
  }

  private async probeMlEndpoint(
    label: string,
    url: string,
    authHeader?: Record<string, string>,
    params?: Record<string, any>,
  ): Promise<MlProbeEntry> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          ...(params ? { params } : {}),
          ...(authHeader ? { headers: authHeader } : {}),
        }),
      );

      return {
        label,
        url,
        ok: true,
        status: response.status,
        data: response.data,
        error: null,
      };
    } catch (error: any) {
      return {
        label,
        url,
        ok: false,
        status: error?.response?.status ?? null,
        data: error?.response?.data ?? null,
        error: {
          message: error?.message ?? null,
          code: error?.response?.data?.code ?? null,
          blockedBy: error?.response?.data?.blocked_by ?? null,
        },
      };
    }
  }

  private summarizeMlProbeData(data: any) {
    if (!data || typeof data !== 'object') {
      return data ?? null;
    }

    return {
      id: data?.id ?? null,
      price: data?.price ?? null,
      amount: data?.amount ?? null,
      regular_amount: data?.regular_amount ?? null,
      original_price: data?.original_price ?? null,
      prices: data?.prices ?? null,
      payment_method_prices: data?.payment_method_prices ?? null,
      sale_price: data?.sale_price ?? null,
      keys: Object.keys(data ?? {}),
    };
  }

  private summarizeMlProbeResult(result: MlProbeResult) {
    const mapEntry = (entry: MlProbeEntry) => ({
      label: entry.label,
      ok: entry.ok,
      status: entry.status,
      error: entry.error,
      dataPreview: this.summarizeMlProbeData(entry.data),
    });

    return {
      itemId: result.itemId,
      withToken: result.withToken.map(mapEntry),
      withoutToken: result.withoutToken.map(mapEntry),
    };
  }

  async debugItemPricingEndpoints(
    itemId: string,
    authHeader?: Record<string, string>,
  ): Promise<MlProbeResult> {
    const endpoints = [
      {
        label: 'item',
        url: `${this.mlApiUrl}/items/${itemId}`,
      },
      {
        label: 'prices',
        url: `${this.mlApiUrl}/items/${itemId}/prices`,
      },
      {
        label: 'sale_price',
        url: `${this.mlApiUrl}/items/${itemId}/sale_price`,
        params: { context: 'channel_marketplace' },
      },
    ];

    const withToken = authHeader
      ? await Promise.all(
          endpoints.map((endpoint) =>
            this.probeMlEndpoint(
              `${endpoint.label}_with_token`,
              endpoint.url,
              authHeader,
              endpoint.params,
            ),
          ),
        )
      : [];

    const withoutToken = await Promise.all(
      endpoints.map((endpoint) =>
        this.probeMlEndpoint(
          `${endpoint.label}_without_token`,
          endpoint.url,
          undefined,
          endpoint.params,
        ),
      ),
    );

    const result: MlProbeResult = {
      itemId,
      withToken,
      withoutToken,
    };

    this.logger.debug(
      `[ML PROBE] ${JSON.stringify(this.summarizeMlProbeResult(result), null, 2)}`,
    );

    return result;
  }

  private normalizeThumbnail(url: string): string {
    return url?.replace(/^http:\/\//i, 'https://') ?? url;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const account = await this.dbService.db.query.marketplaceAccounts.findFirst(
      {
        where: eq(schema.marketplaceAccounts.platform, 'mercado_livre'),
      },
    );

    if (!account) {
      throw new BadRequestException(
        'Nenhuma conta do Mercado Livre autorizada foi encontrada no banco.',
      );
    }

    const isExpired =
      new Date(account.expiresAt).getTime() <= Date.now() + 5 * 60 * 1000;

    let accessToken = account.accessToken;

    if (isExpired) {
      if (!account.refreshToken) {
        throw new BadRequestException(
          'Token do Mercado Livre expirado e sem refresh_token.',
        );
      }

      const refreshed = await this.refreshToken(
        account as MarketplaceAccountRow,
      );

      if (!refreshed) {
        throw new BadRequestException(
          'Falha ao renovar o token do Mercado Livre.',
        );
      }

      accessToken = refreshed;
    }

    if (!accessToken) {
      throw new BadRequestException(
        'Access token do Mercado Livre está vazio.',
      );
    }

    return {
      Authorization: `Bearer ${accessToken}`,
    };
  }

  private async refreshToken(
    account: MarketplaceAccountRow,
  ): Promise<string | null> {
    try {
      const clientId = this.configService.get<string>('ML_CLIENT_ID');
      const clientSecret = this.configService.get<string>('ML_CLIENT_SECRET');
      const tokenUrl = this.configService.get<string>('ML_TOKEN_URL');

      if (!clientId || !clientSecret || !tokenUrl) {
        return null;
      }

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

      this.logger.log('ML Token renovado com sucesso');
      return data.access_token;
    } catch (error: any) {
      this.logger.error(`ML Falha ao renovar token: ${error?.message}`);
      return null;
    }
  }

  private async buildAffiliateLinkShort(
    originalUrl: string,
    tag: string | null,
  ): Promise<string | null> {
    if (!originalUrl) return null;
    if (!tag) return originalUrl;

    try {
      const url = new URL(originalUrl);
      url.searchParams.set('matt_tool', tag);
      return await this.shortenLink(url.toString());
    } catch {
      return originalUrl;
    }
  }

  private async shortenLink(url: string): Promise<string> {
    return url;
  }

  private async getMockProduct(
    query: string,
  ): Promise<MarketplaceProductDetails | null> {
    return {
      platform: 'mercado_livre',
      id: 'MLB000000',
      title: `Mock ${query}`,
      price: 3999.9,
      pixPrice: null,
      originalPrice: 4599.9,
      permalink: 'https://www.mercadolivre.com.br/',
      affiliateLink: 'https://www.mercadolivre.com.br/',
      thumbnail: null,
      installments: {
        quantity: 10,
        amount: 399.99,
        rate: 'sem juros',
      },
      coupon: null,
    };
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

  async searchProducts(query: string): Promise<MarketplaceProductDetails[]> {
    if (!query?.trim()) return [];

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.mlApiUrl}/sites/MLB/search`, {
          params: { q: query.trim(), limit: 10 },
          timeout: 10000,
        }),
      );

      const results = Array.isArray(response.data?.results)
        ? response.data.results
        : [];

      return results.map(
        (item: any): MarketplaceProductDetails => ({
          platform: 'mercado_livre',
          id: String(item.id),
          title: item.title ?? 'Produto sem título',
          price: Number(item.price ?? 0),
          originalPrice: item.original_price
            ? Number(item.original_price)
            : null,
          pixPrice: null,
          permalink: item.permalink ?? '',
          affiliateLink: item.permalink ?? null,
          thumbnail: item.thumbnail
            ? this.normalizeThumbnail(item.thumbnail)
            : null,
          installments: item.installments
            ? {
                quantity: Number(item.installments.quantity),
                amount: Number(item.installments.amount),
                rate:
                  item.installments.rate === 0
                    ? 'sem juros'
                    : item.installments.rate != null
                      ? String(item.installments.rate)
                      : null,
              }
            : null,
          coupon: null,
        }),
      );
    } catch (error: any) {
      this.logger.error(
        `ML searchProducts error: ${JSON.stringify(error?.response?.data ?? error?.message)}`,
      );
      return [];
    }
  }

  private async getMe(accessToken: string) {
    const response = await firstValueFrom(
      this.httpService.get(`${this.mlApiUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      }),
    );

    return response.data;
  }

  async exchangeCodeForToken(code: string) {
    const clientId = this.configService.get<string>('ML_CLIENT_ID');
    const clientSecret = this.configService.get<string>('ML_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('ML_REDIRECT_URI');
    const tokenUrl = this.configService.get<string>('ML_TOKEN_URL');

    if (!clientId || !clientSecret || !redirectUri || !tokenUrl) {
      throw new BadRequestException('Configurações do ML incompletas');
    }

    const response = await axios.post(tokenUrl, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

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

    return account;
  }
  async getMeFromDatabase() {
    const account = await this.dbService.db.query.marketplaceAccounts.findFirst(
      {
        where: eq(marketplaceAccounts.platform, 'mercado_livre'),
      },
    );

    if (!account) {
      throw new NotFoundException('Conta do Mercado Livre não encontrada');
    }

    return account;
  }
  async saveAuthorizedAccount(code: string) {
    return this.exchangeCodeForToken(code);
  }
}
