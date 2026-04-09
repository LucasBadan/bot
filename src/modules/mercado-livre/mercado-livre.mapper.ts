type MercadoLivreSearchItem = {
  id: string;
  title: string;
  permalink: string;
  thumbnail?: string;
  price: number;
  original_price?: number | null;
  currency_id?: string;
  seller?: {
    nickname?: string;
  };
};

export class MercadoLivreMapper {
  static toProductSource(item: any) {
    return {
      marketplace: 'mercado_livre' as const,
      externalProductId: item.id,
      titleOnStore: item.title,
      sourceUrl: item.permalink,
      canonicalUrl: item.permalink,
      imageUrl: item.thumbnail ?? null,
      sellerName: item.seller?.nickname ?? null,
      currency: item.currency_id ?? 'BRL',
      lastPrice: item.price?.toString() ?? null,
      lastPriceOld: item.original_price?.toString() ?? null,
      metadata: item,
    };
  }

  static toPriceHistory(item: any) {
    return {
      price: item.price.toString(),
      listPrice: item.original_price?.toString() ?? null,
      currency: item.currency_id ?? 'BRL',
      inStock: true,
      rawPayload: item,
    };
  }
}
