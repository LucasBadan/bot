import { IsOptional, IsString, MinLength } from 'class-validator';

export class SendShopeeOfferDto {
  @IsString()
  @MinLength(2)
  keyword!: string;

  @IsOptional()
  @IsString()
  groupId?: string;
}
