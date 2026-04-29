import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MlAffiliateHttpClient } from './ml-affiliate-http-client';
import { MlAffiliateLinkExtractor } from './ml-affiliate-link-extractor';

type GenerateAffiliateLinkInput = {
  productUrl: string;
};

@Injectable()
export class MlAffiliateService {
  private readonly logger = new Logger(MlAffiliateService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: MlAffiliateHttpClient,
    private readonly extractor: MlAffiliateLinkExtractor,
  ) {}

  async generateAffiliateLink(
    input: GenerateAffiliateLinkInput,
  ): Promise<string | null> {
    const productUrl = String(input.productUrl ?? '').trim();

    if (!productUrl) {
      throw new BadRequestException('productUrl é obrigatório');
    }

    const endpoint = this.configService.get<string>('ML_AFFILIATE_ENDPOINT');

    if (!endpoint) {
      this.logger.warn(
        '[ML Affiliate] ML_AFFILIATE_ENDPOINT não configurado; retornando null',
      );
      return null;
    }

    const method = (
      this.configService.get<string>('ML_AFFILIATE_METHOD') ?? 'POST'
    ).toUpperCase() as 'GET' | 'POST';

    const requestMode =
      this.configService.get<string>('ML_AFFILIATE_REQUEST_MODE') ?? 'json';

    const response = await this.httpClient.request({
      url: endpoint,
      method,
      headers: this.buildHeaders(),
      ...(method === 'GET'
        ? {
            params: this.buildPayload(productUrl, requestMode),
          }
        : {
            data: this.buildPayload(productUrl, requestMode),
          }),
    });

    const affiliateLink = this.extractor.extract({
      data: response.data,
      location: response.location,
    });

    if (!affiliateLink) {
      this.logger.warn(
        `[ML Affiliate] não foi possível extrair link afiliado para ${productUrl}`,
      );
      return null;
    }

    this.logger.log(
      `[ML Affiliate] link gerado com sucesso para ${productUrl}`,
    );

    return affiliateLink;
  }

  private buildHeaders(): Record<string, string> {
    const contentType =
      this.configService.get<string>('ML_AFFILIATE_CONTENT_TYPE') ??
      'application/json';

    const headers: Record<string, string> = {
      'content-type': contentType,
      origin:
        this.configService.get<string>('ML_AFFILIATE_ORIGIN') ??
        'https://www.mercadolivre.com.br',
      referer:
        this.configService.get<string>('ML_AFFILIATE_REFERER') ??
        'https://www.mercadolivre.com.br/',
      'x-requested-with':
        this.configService.get<string>('ML_AFFILIATE_X_REQUESTED_WITH') ?? '',
    };

    return Object.fromEntries(
      Object.entries(headers).filter(([, value]) => value !== ''),
    );
  }

  private buildPayload(
    productUrl: string,
    requestMode: string,
  ): Record<string, any> | URLSearchParams {
    const payloadKey =
      this.configService.get<string>('ML_AFFILIATE_PRODUCT_URL_KEY') ?? 'url';

    const extraRaw =
      this.configService.get<string>('ML_AFFILIATE_EXTRA_PAYLOAD_JSON') ?? '{}';

    let extraPayload: Record<string, any> = {};
    try {
      extraPayload = JSON.parse(extraRaw);
    } catch {
      extraPayload = {};
    }

    const payload = {
      ...extraPayload,
      [payloadKey]: productUrl,
    };

    if (requestMode === 'form') {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) {
        form.set(key, String(value ?? ''));
      }
      return form;
    }

    return payload;
  }
}
