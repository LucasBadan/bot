import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { MlAffiliateCookieStoreService } from './ml-affiliate-cookie-store-service';

export type MlAffiliateHttpResponse = {
  status: number;
  headers: Record<string, any>;
  data: any;
  setCookies: string[];
  location: string | null;
  finalCookieHeader: string;
};

@Injectable()
export class MlAffiliateHttpClient {
  private readonly logger = new Logger(MlAffiliateHttpClient.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cookieStore: MlAffiliateCookieStoreService,
  ) {}

  async request(config: {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    params?: Record<string, any>;
    data?: any;
    responseType?: AxiosRequestConfig['responseType'];
  }): Promise<MlAffiliateHttpResponse> {
    const cookieHeader = await this.cookieStore.getRawCookieHeader();

    const requestHeaders: Record<string, string> = {
      'user-agent':
        this.configService.get<string>('ML_AFFILIATE_USER_AGENT') ??
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      accept:
        'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(config.headers ?? {}),
    };

    if (cookieHeader) {
      requestHeaders.cookie = cookieHeader;
    }

    const response: AxiosResponse = await axios.request({
      url: config.url,
      method: config.method ?? 'GET',
      headers: requestHeaders,
      params: config.params,
      data: config.data,
      responseType: config.responseType ?? 'text',
      maxRedirects: 0,
      validateStatus: () => true,
    });

    const rawSetCookie = response.headers['set-cookie'];
    const setCookies = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : rawSetCookie
        ? [String(rawSetCookie)]
        : [];

    const finalCookieHeader = setCookies.length
      ? await this.cookieStore.mergeSetCookies(setCookies)
      : cookieHeader;

    const location =
      typeof response.headers?.location === 'string'
        ? response.headers.location
        : null;

    this.logger.debug(
      `[ML Affiliate] ${config.method ?? 'GET'} ${config.url} -> ${response.status}`,
    );

    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
      setCookies,
      location,
      finalCookieHeader,
    };
  }
}
