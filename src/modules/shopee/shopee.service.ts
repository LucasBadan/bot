import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { MarketplaceProductDetails } from '../marketplace/marketplace.types';

type ShopeeGraphQLNode = {
  itemId?: number | string;
  productName?: string;
  productLink?: string;
  offerLink?: string;
  imageUrl?: string;
  price?: number | string;
  priceMin?: number | string;
  priceMax?: number | string;
  sales?: number | string;
  shopName?: string;
  commissionRate?: number | string;
};

@Injectable()
export class ShopeeService {
  private readonly logger = new Logger(ShopeeService.name);
  private readonly appId: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly useMock: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.appId = this.configService.get<string>('SHOPEE_APP_ID', '');
    this.secret = this.configService.get<string>('SHOPEE_SECRET', '');
    this.baseUrl = this.configService.get<string>(
      'SHOPEE_BASE_URL',
      'https://open-api.affiliate.shopee.com.br/graphql',
    );
    this.useMock =
      this.configService.get<string>('SHOPEE_USE_MOCK', 'true') === 'true';
  }

  async searchProducts(query: string): Promise<MarketplaceProductDetails[]> {
    const term = query.trim();

    if (!term) {
      return [];
    }

    if (this.useMock || !this.hasCredentials()) {
      this.logger.warn(
        `[Shopee] usando mock para "${term}" (sem credenciais ou SHOPEE_USE_MOCK=true)`,
      );
      return this.getMockProducts(term);
    }

    return this.searchProductsReal(term);
  }

  async getBestProduct(
    query: string,
  ): Promise<MarketplaceProductDetails | null> {
    const products = await this.searchProducts(query);

    const affiliateProducts = products.filter((product) =>
      Boolean(product.affiliateLink?.trim()),
    );

    if (!affiliateProducts.length) {
      return null;
    }

    return affiliateProducts.sort((a, b) => {
      const priceA = Number(a.pixPrice ?? a.price ?? 0);
      const priceB = Number(b.pixPrice ?? b.price ?? 0);
      return priceA - priceB;
    })[0];
  }

  formatOfferMessage(product: MarketplaceProductDetails): string {
    if (!product.affiliateLink?.trim()) {
      return '';
    }

    const effectivePrice = Number(product.pixPrice ?? product.price ?? 0);

    const formattedPrice =
      effectivePrice > 0
        ? effectivePrice.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })
        : 'Preço indisponível';

    const originalPrice =
      product.originalPrice && product.originalPrice > effectivePrice
        ? product.originalPrice.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          })
        : null;

    return [
      '🔥 *Oferta Shopee*',
      '',
      `📦 ${product.title}`,
      originalPrice ? `🏷️ De: ${originalPrice}` : null,
      `💸 Por: ${formattedPrice}`,
      product.coupon ? `🎟️ Cupom: ${product.coupon}` : null,
      `🔗 ${product.affiliateLink}`,
      '',
      'Corre porque pode acabar.',
    ]
      .filter(Boolean)
      .join('\n');
  }
  private hasCredentials(): boolean {
    return Boolean(this.appId && this.secret);
  }

  private buildAuthHeader(payload: string, timestamp: string): string {
    const signature = crypto
      .createHash('sha256')
      .update(`${this.appId}${timestamp}${payload}${this.secret}`)
      .digest('hex');

    return `SHA256 Credential=${this.appId}, Timestamp=${timestamp}, Signature=${signature}`;
  }

  private async searchProductsReal(
    query: string,
  ): Promise<MarketplaceProductDetails[]> {
    const graphql = `
      query SearchProducts {
        productOfferV2(
          keyword: ${JSON.stringify(query)},
          sortType: 2,
          page: 1,
          limit: 10
        ) {
          nodes {
            itemId
            productName
            productLink
            offerLink
            imageUrl
            price
            priceMin
            priceMax
            sales
            shopName
            commissionRate
          }
          pageInfo {
            page
            limit
            hasNextPage
          }
        }
      }
    `;

    const payload = JSON.stringify({ query: graphql });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const authorization = this.buildAuthHeader(payload, timestamp);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(this.baseUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: authorization,
          },
          timeout: 15000,
        }),
      );

      if (data?.errors?.length) {
        this.logger.error(
          `[Shopee] GraphQL errors: ${JSON.stringify(data.errors)}`,
        );
        return [];
      }

      const items: ShopeeGraphQLNode[] =
        data?.data?.productOfferV2?.nodes ?? [];

      return items.map((item) => this.mapShopeeProduct(item));
    } catch (error: any) {
      this.logger.error(
        `[Shopee] erro real em searchProducts: ${JSON.stringify(
          error?.response?.data ?? error?.message,
        )}`,
      );
      return [];
    }
  }

  private mapShopeeProduct(
    product: ShopeeGraphQLNode,
  ): MarketplaceProductDetails {
    const lowestPrice = Number(
      product?.priceMin ?? product?.price ?? product?.priceMax ?? 0,
    );

    const highestPrice = Number(
      product?.priceMax ?? product?.price ?? product?.priceMin ?? 0,
    );

    const permalink = String(product?.productLink ?? '').trim() || '#';
    const affiliateLink = String(product?.offerLink ?? '').trim() || null;

    return {
      platform: 'shopee',
      id: String(product?.itemId ?? crypto.randomUUID()),
      title: String(product?.productName ?? 'Produto Shopee').trim(),
      price: lowestPrice,
      pixPrice: lowestPrice || null,
      originalPrice: highestPrice > lowestPrice ? highestPrice : null,
      permalink,
      affiliateLink,
      thumbnail: String(product?.imageUrl ?? '').trim() || null,
      variant: null,
      availableQuantity: undefined,
      installments: null,
      coupon: null,
    };
  }

  private getMockProducts(query: string): MarketplaceProductDetails[] {
    return [
      {
        platform: 'shopee',
        id: 'SHP-MOCK-001',
        title: `Produto mock Shopee para ${query}`,
        price: 199.9,
        pixPrice: 179.9,
        originalPrice: 249.9,
        permalink: 'https://shopee.com.br/produto-mock',
        affiliateLink: 'https://s.shopee.com.br/produto-mock-afiliado',
        thumbnail: null,
        variant: null,
        availableQuantity: 25,
        installments: null,
        coupon: 'PROMO10',
      },
    ];
  }
}
