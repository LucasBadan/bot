import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

@Injectable()
export class MlAffiliateLinkExtractor {
  extract(input: {
    data: unknown;
    location?: string | null;
  }): string | null {
    if (input.location && this.looksLikeUrl(input.location)) {
      return input.location;
    }

    if (typeof input.data === 'string') {
      const fromHtml = this.extractFromHtml(input.data);
      if (fromHtml) return fromHtml;

      const fromText = this.extractUrlFromText(input.data);
      if (fromText) return fromText;
    }

    if (input.data && typeof input.data === 'object') {
      const fromJson = this.extractFromObject(input.data as Record<string, any>);
      if (fromJson) return fromJson;
    }

    return null;
  }

  private extractFromHtml(html: string): string | null {
    const $ = cheerio.load(html);

    const candidates = [
      $('input[name="affiliate_link"]').val(),
      $('input[name="short_url"]').val(),
      $('input[name="url"]').val(),
      $('[data-affiliate-link]').attr('data-affiliate-link'),
      $('a[href*="mercadolivre"]').attr('href'),
      $('a[href*="meli"]').attr('href'),
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && this.looksLikeUrl(candidate)) {
        return candidate;
      }
    }

    return this.extractUrlFromText($.text());
  }

  private extractFromObject(obj: Record<string, any>): string | null {
    const keys = [
      'affiliateLink',
      'affiliate_link',
      'shortUrl',
      'short_url',
      'url',
      'link',
      'redirect',
      'redirect_url',
    ];

    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && this.looksLikeUrl(value)) {
        return value;
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        const nested = this.extractFromObject(value as Record<string, any>);
        if (nested) return nested;
      }
    }

    return null;
  }

  private extractUrlFromText(text: string): string | null {
    const match = String(text ?? '').match(/https?:\/\/[^\s"'<>]+/i);
    return match?.[0] ?? null;
  }

  private looksLikeUrl(value: string): boolean {
    return /^https?:\/\//i.test(String(value ?? '').trim());
  }
}
Esse serviço tenta achar o link final no location, HTML ou JSON, porque ainda não sabemos qual formato o ML retorna no seu fluxo real.

ml-affiliate.service.ts
ts
import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
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
      this.configService.get<string>('ML_AFFILIATE_PRODUCT_URL_KEY') ??
      'url';

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