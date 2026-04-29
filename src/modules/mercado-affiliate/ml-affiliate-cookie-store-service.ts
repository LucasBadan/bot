import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/modules/redis/redis.service';

@Injectable()
export class MlAffiliateCookieStoreService {
  private readonly logger = new Logger(MlAffiliateCookieStoreService.name);
  private readonly redisKey = 'ml:affiliate:cookies';

  constructor(private readonly redisService: RedisService) {}

  async getRawCookieHeader(): Promise<string> {
    const cookieHeader = await this.redisService.get(this.redisKey);
    return cookieHeader?.trim() ?? '';
  }

  async setRawCookieHeader(cookieHeader: string): Promise<void> {
    await this.redisService.set(this.redisKey, cookieHeader);
  }

  async mergeSetCookies(setCookies: string[] = []): Promise<string> {
    const current = await this.getRawCookieHeader();
    const parsed = this.parseCookieHeader(current);

    for (const setCookie of setCookies) {
      const [pair] = String(setCookie).split(';');
      if (!pair) continue;

      const index = pair.indexOf('=');
      if (index === -1) continue;

      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();

      if (!name) continue;
      parsed.set(name, value);
    }

    const merged = Array.from(parsed.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    await this.setRawCookieHeader(merged);

    this.logger.log(
      `[ML Affiliate] cookies atualizados: ${parsed.size} cookie(s) persistidos`,
    );

    return merged;
  }

  parseCookieHeader(cookieHeader: string): Map<string, string> {
    const map = new Map<string, string>();

    for (const chunk of String(cookieHeader ?? '').split(';')) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;

      const index = trimmed.indexOf('=');
      if (index === -1) continue;

      const name = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();

      if (!name) continue;
      map.set(name, value);
    }

    return map;
  }
}
