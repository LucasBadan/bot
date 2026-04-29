import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchMercadoLivreDto {
  @IsString()
  @IsNotEmpty()
  q: string;

  @IsOptional()
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  categoryId?: string; // ← ADICIONA ISSO
}

export class SendShopeeOfferDto {
  chatId!: string;
  productId!: string;
  affiliateLink!: string;
}
