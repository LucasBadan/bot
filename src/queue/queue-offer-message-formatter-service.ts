import { Injectable } from '@nestjs/common';
import { PublishOfferJobData } from './queue.constants';

@Injectable()
export class OfferMessageFormatterService {
  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  format(oferta: PublishOfferJobData['oferta']): string {
    const finalLink =
      oferta.affiliateLink?.trim() || oferta.permalink?.trim() || '';

    const validPrices = [oferta.pixPrice, oferta.price]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    const cashPrice = validPrices.length
      ? Math.min(...validPrices)
      : Number(oferta.price);

    const discountPercent =
      oferta.originalPrice && oferta.originalPrice > oferta.price
        ? Math.round(
            ((oferta.originalPrice - oferta.price) / oferta.originalPrice) *
              100,
          )
        : null;

    const variantLine = oferta.variantAlert
      ? oferta.variant
        ? `📦 Apenas ${oferta.variant}`
        : null
      : oferta.variant
        ? `📦 Modelo: ${oferta.variant}`
        : null;

    const installmentLine = oferta.installments
      ? `💳 ${oferta.installments.quantity}x de ${this.formatCurrency(
          oferta.installments.amount,
        )}${oferta.installments.rate ? ` ${oferta.installments.rate}` : ''}`
      : null;

    const couponLine = oferta.coupon?.trim()
      ? `🎟️ Cupom: ${oferta.coupon.trim()}`
      : null;

    return [
      oferta.isDropped ? '🔥 FICOU AINDA MAIS BARATO!' : '🛒 OFERTA IMPERDÍVEL',
      oferta.keyword ? `🔎 ${oferta.keyword}` : null,
      `*${oferta.title}*`,
      variantLine,
      oferta.originalPrice
        ? `🏷️ De: ${this.formatCurrency(oferta.originalPrice)}`
        : null,
      `💵 À vista: ${this.formatCurrency(cashPrice)}`,
      oferta.pixPrice && oferta.pixPrice > 0 && oferta.pixPrice < oferta.price
        ? `⚡ No Pix: ${this.formatCurrency(oferta.pixPrice)}`
        : null,
      discountPercent ? `📉 Desconto: ${discountPercent}% OFF` : null,
      installmentLine,
      couponLine,
      finalLink ? `🔗 ${finalLink}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
