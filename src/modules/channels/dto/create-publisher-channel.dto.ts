import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePublisherChannelDto {
  @IsString()
  @IsIn(['telegram', 'whatsapp', 'discord', 'twitter', 'instagram', 'other'])
  type: 'telegram' | 'whatsapp' | 'discord' | 'twitter' | 'instagram' | 'other';

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  target: string;

  @IsOptional()
  configJson?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
