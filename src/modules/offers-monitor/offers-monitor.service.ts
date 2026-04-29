import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { DbService } from 'src/db/db.service';
import { QueueService } from 'src/queue/queue.service';
import { MercadoLivreService } from '../mercado-livre/mercado-livre.service';
import { ShopeeService } from '../shopee/shopee.service';

type Marketplace = 'mercado_livre' | 'shopee';

type MonitorKeyword = {
  id: string;
  term: string;
  marketplace: Marketplace;
  mlProductId?: string | null;
  shopeeItemId?: string | null;
  minDiscount?: number;
  variant?: string | null;
  variantAlert?: boolean;
};

type OfertaMonitorada = {
  id: string;
  title: string;
  price: number;
  pixPrice?: number | null;
  originalPrice?: number | null;
  permalink: string;
  affiliateLink?: string | null;
  thumbnail?: string | null;
  installments?: {
    quantity: number;
    amount: number;
    rate: string | null;
  } | null;
  coupon?: string | null;
  keyword?: string;
};

@Injectable()
export class OffersMonitorService {
  private readonly logger = new Logger(OffersMonitorService.name);
  private readonly INTERVAL_MS = 3 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly mercadoLivreService: MercadoLivreService,
    private readonly shopeeService: ShopeeService,
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

    if (!groupId) {
      throw new Error('WHAPI_DEFAULT_GROUP_ID não configurado');
    }

    this.logger.log(`Grupo configurado: ${groupId}`);

    const keywords = await this.getKeywords();

    this.logger.log(
      `Keywords encontradas: ${keywords.map((k) => `${k.term} [${k.marketplace}]`).join(', ')}`,
    );

    const sent: Array<{ keyword: string; productId: string; title: string }> =
      [];
    const errors: Array<{ keyword: string; error: string }> = [];
    const offersToSend: Array<{
      keyword: MonitorKeyword;
      oferta: OfertaMonitorada;
      isDropped: boolean;
    }> = [];

    for (const keyword of keywords) {
      try {
        this.logger.log(
          `Buscando oferta para ${keyword.term} [${keyword.marketplace}]`,
        );

        const ofertaRaw = await this.findOfferByMarketplace(keyword);

        if (!ofertaRaw) {
          this.logger.warn(`Nenhuma oferta encontrada para "${keyword.term}"`);
          continue;
        }

        const discount = this.getDiscountPercent(
          ofertaRaw.price,
          ofertaRaw.originalPrice,
        );

        const minDiscount = keyword.minDiscount ?? 0;

        if (minDiscount > 0 && (!discount || discount < minDiscount)) {
          this.logger.warn(
            `${keyword.term} desconto ${discount ?? 0}% abaixo do mínimo ${minDiscount}%`,
          );
          continue;
        }

        const { canPost, isDropped } = await this.shouldPost(
          ofertaRaw.id,
          ofertaRaw.price,
        );

        if (!canPost) {
          this.logger.warn(`${keyword.term} já postado recentemente, pulando`);
          continue;
        }

        offersToSend.push({
          keyword,
          oferta: {
            ...ofertaRaw,
            keyword: keyword.term,
          },
          isDropped,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Erro desconhecido';

        this.logger.error(`Erro ${keyword.term}: ${msg}`);
        errors.push({ keyword: keyword.term, error: msg });
      }
    }

    this.logger.log(
      `[Queue] ${offersToSend.length} ofertas válidas para enfileirar`,
    );

    for (let i = 0; i < offersToSend.length; i++) {
      const { keyword, oferta, isDropped } = offersToSend[i];
      const delayMs = i * this.INTERVAL_MS;

      await this.queueService.enqueuePublishOffer(
        {
          groupId,
          oferta: {
            id: oferta.id,
            title: oferta.title,
            price: oferta.price,
            pixPrice: oferta.pixPrice ?? null,
            originalPrice: oferta.originalPrice ?? null,
            permalink: oferta.permalink,
            affiliateLink: oferta.affiliateLink ?? null,
            thumbnail: oferta.thumbnail ?? null,
            installments: oferta.installments ?? null,
            coupon: oferta.coupon ?? null,
            keyword: keyword.term,
            variant: keyword.variant ?? null,
            variantAlert: keyword.variantAlert ?? false,
            isDropped,
            marketplace: keyword.marketplace,
          },
        },
        delayMs,
      );

      this.logger.log(
        `[Queue] ${keyword.term} enfileirado - delay ${Math.round(
          delayMs / 60000,
        )}min`,
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

  private async findOfferByMarketplace(
    keyword: MonitorKeyword,
  ): Promise<OfertaMonitorada | null> {
    if (keyword.marketplace === 'mercado_livre') {
      const oferta = await this.mercadoLivreService.searchProductsAfiliado(
        keyword.term,
        keyword.mlProductId ?? undefined,
        keyword.mlProductId ?? undefined,
      );

      if (oferta) {
        this.logger.log(
          `[MercadoLivre] oferta encontrada para "${keyword.term}": ${oferta.id} - ${oferta.title}`,
        );
      }

      return oferta ?? null;
    }

    if (keyword.marketplace === 'shopee') {
      this.logger.log(`[Shopee] buscando keyword=${keyword.term}`);

      const products = await this.shopeeService.searchProducts(keyword.term);

      this.logger.log(
        `[Shopee] resultados para "${keyword.term}": ${products.length}`,
      );

      if (products[0]) {
        this.logger.log(
          `[Shopee] primeiro item: ${products[0].id} - ${products[0].title}`,
        );
      }

      const selectedById = keyword.shopeeItemId
        ? products.find((item) => item.id === keyword.shopeeItemId)
        : undefined;

      if (keyword.shopeeItemId && !selectedById) {
        this.logger.warn(
          `[Shopee] item ${keyword.shopeeItemId} não encontrado para "${keyword.term}", usando primeiro resultado como fallback`,
        );
      }

      const selectedProduct = selectedById ?? products[0] ?? null;

      if (!selectedProduct) {
        this.logger.warn(
          `[Shopee] nenhum produto selecionado para "${keyword.term}"`,
        );
        return null;
      }

      const oferta: OfertaMonitorada = {
        id: selectedProduct.id,
        title: selectedProduct.title,
        price: selectedProduct.price,
        pixPrice: selectedProduct.pixPrice ?? null,
        originalPrice: selectedProduct.originalPrice ?? null,
        permalink: selectedProduct.permalink,
        affiliateLink: selectedProduct.affiliateLink ?? null,
        thumbnail: selectedProduct.thumbnail ?? null,
        installments: null,
        coupon: selectedProduct.coupon ?? null,
        keyword: keyword.term,
      };

      this.logger.log(
        `[Shopee] oferta selecionada para "${keyword.term}": ${oferta.id} - ${oferta.title}`,
      );

      return oferta;
    }

    return null;
  }

  async shouldPost(
    productId: string,
    currentPrice: number,
  ): Promise<{ canPost: boolean; isDropped: boolean }> {
    try {
      const lastPost = await this.dbService.db.query.dealCandidates.findFirst({
        where: (t) =>
          sql`${t.productId} = ${productId} and ${t.status} = 'posted'`,
        orderBy: (t, { desc }) => desc(t.postedAt),
      });

      if (!lastPost) {
        return { canPost: true, isDropped: false };
      }

      const hoursSince =
        (Date.now() - new Date(lastPost.postedAt!).getTime()) / 1000 / 60 / 60;

      const lastPrice = Number(lastPost.currentPrice);
      const dropped = currentPrice < lastPrice;
      const dropPercent = dropped
        ? Math.round(((lastPrice - currentPrice) / lastPrice) * 100)
        : 0;

      if (dropped && dropPercent >= 2) {
        return { canPost: true, isDropped: true };
      }

      if (hoursSince >= 48) {
        return { canPost: true, isDropped: false };
      }

      return { canPost: false, isDropped: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';

      this.logger.warn(
        `[shouldPost] falha ao consultar histórico do produto ${productId}: ${msg}`,
      );

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
      .filter((item: any) => item?.id && item?.term && item?.marketplace)
      .map((item: any) => ({
        id: String(item.id),
        term: String(item.term).trim(),
        marketplace: this.normalizeMarketplace(item.marketplace),
        mlProductId: item.mlProductId ?? null,
        shopeeItemId: item.shopeeItemId ?? null,
        minDiscount: Number(item.minDiscount ?? 0),
        variant: item.variant ?? null,
        variantAlert: Boolean(item.variantAlert ?? false),
      }));
  }

  private normalizeMarketplace(value: unknown): Marketplace {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[-\s]/g, '_');

    if (normalized === 'mercadolivre' || normalized === 'mercado_livre') {
      return 'mercado_livre';
    }

    if (normalized === 'shopee') {
      return 'shopee';
    }

    throw new Error(`Marketplace inválido: ${value}`);
  }

  private getDiscountPercent(
    price: number,
    originalPrice?: number | null,
  ): number | null {
    if (!originalPrice || originalPrice <= price) {
      return null;
    }

    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  @Cron('*/10 * * * *')
  async scheduledMonitor() {
    this.logger.log('[Cron] Iniciando monitoramento agendado...');
    await this.monitorOffers();
  }
}
