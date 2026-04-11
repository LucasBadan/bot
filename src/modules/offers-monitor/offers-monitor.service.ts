import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoLivreService } from '../mercado-livre/mercado-livre.service';
import { WhapiService } from '../whapi/whapi.service';
import { DbService } from 'src/db/db.service';
import { QueueService } from 'src/queue/queue.service';
import { eq, and, desc } from 'drizzle-orm';
import { dealCandidates } from 'src/db/schema';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Cron } from '@nestjs/schedule';

type MonitorKeyword = {
  id: string;
  term: string;
  mlProductId?: string;
  minDiscount?: number;
  variant?: string | null;
  variantAlert?: boolean;
};

type OfertaMonitorada = {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  permalink: string;
  affiliateLink?: string | null;
  thumbnail?: string | null;
  installments?: { quantity: number; amount: number; rate: string } | null;
  coupon?: string | null;
  keyword: string;
};

@Injectable()
export class OffersMonitorService {
  private readonly logger = new Logger(OffersMonitorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mercadoLivreService: MercadoLivreService,
    private readonly whapiService: WhapiService,
    private readonly dbService: DbService,
    private readonly queueService: QueueService,
  ) {}

  async monitorOffers(): Promise<{
    success: boolean;
    totalKeywords: number;
    totalSent: number;
    sent: Array<{ keyword: string; productId: string; title: string }>;
    errors: Array<{ keyword: string; error: string }>;
  }> {
    const groupId = this.configService.get<string>('WHAPI_DEFAULT_GROUP_ID');

    if (!groupId) throw new Error('WHAPI_DEFAULT_GROUP_ID não configurado');

    this.logger.log(`Grupo configurado: ${groupId}`);

    const keywords = await this.getKeywords();
    this.logger.log(
      `Keywords encontradas: ${keywords.map((k) => k.term).join(', ')}`,
    );

    const sent: Array<{ keyword: string; productId: string; title: string }> =
      [];
    const errors: Array<{ keyword: string; error: string }> = [];
    const offersToSend: Array<{
      keyword: MonitorKeyword;
      oferta: OfertaMonitorada;
      isDropped: boolean;
    }> = [];

    // 1. Coleta todas as ofertas válidas
    for (const keyword of keywords) {
      try {
        this.logger.log(`Buscando oferta para: ${keyword.term}`);

        const ofertaRaw = await this.mercadoLivreService.searchProductsAfiliado(
          keyword.term,
          keyword.mlProductId ?? undefined,
        );

        if (!ofertaRaw) {
          this.logger.warn(`Nenhuma oferta encontrada para "${keyword.term}"`);
          continue;
        }

        // Verifica desconto mínimo
        const discount = this.getDiscountPercent(
          ofertaRaw.price,
          ofertaRaw.originalPrice,
        );
        const minDiscount = keyword.minDiscount ?? 0;

        if (minDiscount > 0 && (!discount || discount < minDiscount)) {
          this.logger.warn(
            `"${keyword.term}" desconto ${discount ?? 0}% abaixo do mínimo ${minDiscount}%`,
          );
          continue;
        }

        // Verifica se deve postar
        const { canPost, isDropped } = await this.shouldPost(
          ofertaRaw.id,
          ofertaRaw.price,
        );

        if (!canPost) {
          this.logger.warn(
            `"${keyword.term}" já postado recentemente, pulando`,
          );
          continue;
        }

        offersToSend.push({
          keyword,
          oferta: { ...ofertaRaw, keyword: keyword.term },
          isDropped,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Erro desconhecido';
        this.logger.error(`❌ Erro "${keyword.term}": ${msg}`);
        errors.push({ keyword: keyword.term, error: msg });
      }
    }

    this.logger.log(
      `[Queue] ${offersToSend.length} ofertas válidas para enfileirar`,
    );

    // 2. Enfileira com intervalo de 3 minutos entre cada post
    const INTERVAL_MS = 3 * 60 * 1000;

    for (let i = 0; i < offersToSend.length; i++) {
      const { keyword, oferta, isDropped } = offersToSend[i];
      const delayMs = i * INTERVAL_MS;

      await this.queueService.enqueuePublishOffer(
        {
          groupId,
          oferta: {
            id: oferta.id,
            title: oferta.title,
            price: oferta.price,
            originalPrice: oferta.originalPrice ?? null,
            permalink: oferta.permalink,
            affiliateLink: oferta.affiliateLink ?? null,
            thumbnail: oferta.thumbnail ?? null,
            installments: oferta.installments ?? null,
            keyword: keyword.term,
            variant: keyword.variant ?? null,
            variantAlert: keyword.variantAlert ?? false,
            isDropped,
          },
        },
        delayMs,
      );

      this.logger.log(
        `[Queue] "${keyword.term}" enfileirado - delay: ${Math.round(delayMs / 60000)}min`,
      );

      sent.push({
        keyword: keyword.term,
        productId: oferta.id,
        title: oferta.title,
      });
    }

    return {
      success: true,
      totalKeywords: keywords.length,
      totalSent: sent.length,
      sent,
      errors,
    };
  }

  async shouldPost(
    productId: string,
    currentPrice: number,
  ): Promise<{ canPost: boolean; isDropped: boolean }> {
    try {
      const lastPost = await this.dbService.db.query.dealCandidates.findFirst({
        where: (t) => and(eq(t.productId, productId), eq(t.status, 'posted')),
        orderBy: (t) => [desc(t.postedAt)],
      });

      if (!lastPost) return { canPost: true, isDropped: false };

      const hoursSince =
        (Date.now() - new Date(lastPost.postedAt!).getTime()) /
        (1000 * 60 * 60);

      const lastPrice = Number(lastPost.currentPrice);
      const dropped = currentPrice < lastPrice;
      const dropPercent = dropped
        ? Math.round(((lastPrice - currentPrice) / lastPrice) * 100)
        : 0;

      if (dropped && dropPercent >= 2)
        return { canPost: true, isDropped: true };
      if (hoursSince >= 48) return { canPost: true, isDropped: false };

      return { canPost: false, isDropped: false };
    } catch {
      return { canPost: true, isDropped: false };
    }
  }

  private async getKeywords(): Promise<MonitorKeyword[]> {
    const filePath = path.resolve(
      process.cwd(),
      'public',
      'offers-keywords.json',
    );
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    return parsed
      .filter((item: any) => item?.id && item?.term)
      .map((item: any) => ({
        id: String(item.id),
        term: String(item.term).trim(),
        mlProductId: item.mlProductId ?? null,
        minDiscount: item.minDiscount ?? 0,
        variant: item.variant ?? null,
        variantAlert: item.variantAlert ?? false,
      }));
  }

  private async saveOffer(oferta: any, keywordId: string): Promise<void> {
    this.logger.log(
      `saveOffer stub -> keywordId=${keywordId}, productId=${oferta?.id}`,
    );
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private getDiscountPercent(
    price: number,
    originalPrice?: number | null,
  ): number | null {
    if (!originalPrice || originalPrice <= price) return null;
    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  @Cron('*/10 * * * *')
  async scheduledMonitor() {
    this.logger.log('[Cron] Iniciando monitoramento agendado...');
    await this.monitorOffers();
  }
}
