import { BadRequestException, Injectable } from '@nestjs/common';
import { desc, eq, and } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { publisherChannels } from 'src/db/schema';
import { CreatePublisherChannelDto } from './dto/create-publisher-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(private readonly db: DbService) {}

  async create(dto: CreatePublisherChannelDto) {
    const [existing] = await this.db.db
      .select()
      .from(publisherChannels)
      .where(
        and(
          eq(publisherChannels.type, dto.type),
          eq(publisherChannels.target, dto.target),
        ),
      );

    if (existing) {
      throw new BadRequestException('Channel already exists');
    }

    const [channel] = await this.db.db
      .insert(publisherChannels)
      .values({
        type: dto.type,
        name: dto.name,
        target: dto.target,
        configJson: dto.configJson ?? null,
        isActive: dto.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return channel;
  }

  async findAll() {
    return this.db.db
      .select()
      .from(publisherChannels)
      .orderBy(desc(publisherChannels.createdAt));
  }

  async findById(id: string) {
    const [channel] = await this.db.db
      .select()
      .from(publisherChannels)
      .where(eq(publisherChannels.id, id));

    return channel ?? null;
  }
}
