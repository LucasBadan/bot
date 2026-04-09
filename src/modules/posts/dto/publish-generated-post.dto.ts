import { IsUUID } from 'class-validator';

export class PublishGeneratedPostDto {
  @IsUUID()
  channelId: string;
}
