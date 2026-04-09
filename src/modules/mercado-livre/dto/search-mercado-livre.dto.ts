import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

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
