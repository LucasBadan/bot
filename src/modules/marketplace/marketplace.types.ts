export type MarketplaceName = 'mercado_livre' | 'shopee';

export type MarketplaceInstallments = {
  quantity: number;
  amount: number;
  rate: string | null;
} | null;

export interface MarketplaceProductDetails {
  platform: MarketplaceName;
  id: string;
  title: string;
  price: number;
  pixPrice?: number | null;
  originalPrice?: number | null;
  permalink: string;
  affiliateLink?: string | null;
  thumbnail?: string | null;
  installments?: MarketplaceInstallments;
  coupon?: string | null;
  variant?: string | null;
  availableQuantity?: number | null;
}
