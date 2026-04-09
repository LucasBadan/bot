import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoLivreService } from '../mercado-livre/mercado-livre.service';
import { WhapiService } from '../whapi/whapi.service';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

type MonitorKeyword = {
  id: string;
  term: string;
};

type OfertaMonitorada = {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  permalink: string;
  affiliateLink?: string | null;
  thumbnail?: string | null;
  installments?: any;
  coupon?: string | null;
  keyword: string; // adicionado para formatMessage
};

@Injectable()
export class OffersMonitorService {
  private readonly logger = new Logger(OffersMonitorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mercadoLivreService: MercadoLivreService,
    private readonly whapiService: WhapiService,
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
      `Keywords encontradas: ${keywords.map((k) => k.term).join(', ')}`,
    );

    const sent: Array<{ keyword: string; productId: string; title: string }> =
      [];
    const errors: Array<{ keyword: string; error: string }> = [];

    for (const keyword of keywords) {
      try {
        this.logger.log(`Buscando oferta para: ${keyword.term}`);

        const ofertaRaw = await this.mercadoLivreService.searchProductsAfiliado(
          keyword.term,
        );

        if (!ofertaRaw) {
          this.logger.warn(`Nenhuma oferta encontrada para "${keyword.term}"`);
          continue;
        }

        await this.saveOffer(ofertaRaw, keyword.id);

        const oferta: OfertaMonitorada = {
          ...ofertaRaw,
          keyword: keyword.term, // adiciona keyword para formatação
        };

        const thumbnail = oferta.thumbnail;
        const message = this.formatarMensagem(oferta);

        this.logger.log(`Mensagem montada para "${keyword.term}"`);

        if (thumbnail) {
          await this.whapiService.sendImage(groupId, thumbnail, message);
          this.logger.log(
            `✅ Oferta publicada com imagem para "${keyword.term}"`,
          );
        } else {
          await this.whapiService.sendText(groupId, message);
          this.logger.log(
            `✅ Oferta publicada em texto para "${keyword.term}"`,
          );
        }

        sent.push({
          keyword: keyword.term,
          productId: oferta.id,
          title: oferta.title,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Erro desconhecido';

        this.logger.error(
          `❌ Erro ao monitorar ofertas para a keyword "${keyword.term}": ${message}`,
        );

        errors.push({
          keyword: keyword.term,
          error: message,
        });
      }
    }

    return {
      success: true,
      totalKeywords: keywords.length,
      totalSent: sent.length,
      sent,
      errors,
    };
  }

  private async getKeywords(): Promise<{ id: string; term: string }[]> {
    const filePath = path.resolve(
      process.cwd(),
      'public',
      'offers-keywords.json',
    );
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error('offers-keywords.json deve conter um array');
    }

    return parsed
      .filter((item) => item?.id && item?.term)
      .map((item) => ({
        id: String(item.id),
        term: String(item.term).trim(),
      }))
      .filter((item) => item.term.length > 0);
  }

  private async saveOffer(oferta: any, keywordId: string): Promise<void> {
    this.logger.log(
      `saveOffer stub -> keywordId=${keywordId}, productId=${oferta?.id}, title=${oferta?.title}`,
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

  private formatarMensagem(oferta: OfertaMonitorada): string {
    const finalLink = oferta.affiliateLink || oferta.permalink || '';

    const priceLines = oferta.originalPrice
      ? [
          `🏷️ *De: ${this.formatCurrency(oferta.originalPrice)}*`,
          `💰 *Por: ${this.formatCurrency(oferta.price)}*`,
          this.getDiscountPercent(oferta.price, oferta.originalPrice)
            ? `📉 *Desconto: ${this.getDiscountPercent(oferta.price, oferta.originalPrice)}%*`
            : null,
        ]
      : [`💰 *Preço: ${this.formatCurrency(oferta.price)}*`];

    return [
      '🔥 *OFERTA IMPERDÍVEL*',
      `🔎 ${oferta.keyword}`,
      `*${oferta.title}*`,
      ...priceLines,
      '👇 *Clique e compre agora* 👇',
      finalLink,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
