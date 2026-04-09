import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from 'src/db/db.service';
import { generatedPosts, publishLogs, publisherChannels } from 'src/db/schema';
import { QueueService } from 'src/queue/queue.service';

@Injectable()
export class PostsService {
  constructor(
    private readonly db: DbService,
    private readonly queueService: QueueService,
  ) {}

  async findById(id: string) {
    const [post] = await this.db.db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.id, id));

    if (!post) {
      throw new NotFoundException('Generated post not found');
    }

    return post;
  }

  async publish(postId: string, channelId: string) {
    const [post] = await this.db.db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.id, postId));

    if (!post) {
      throw new NotFoundException('Generated post not found');
    }

    const [channel] = await this.db.db
      .select()
      .from(publisherChannels)
      .where(eq(publisherChannels.id, channelId));

    if (!channel) {
      throw new NotFoundException('Publisher channel not found');
    }

    if (!channel.isActive) {
      throw new BadRequestException('Publisher channel is inactive');
    }

    const [publishLog] = await this.db.db
      .insert(publishLogs)
      .values({
        generatedPostId: post.id,
        platform: channel.type,
        destination: channel.target,
        status: 'queued',
        queueJobStatus: 'waiting',
        payload: {
          generatedPostId: post.id,
          channelId: channel.id,
        },
        retries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const job = await this.queueService.enqueuePublishGeneratedPost({
      publishLogId: publishLog.id,
      generatedPostId: post.id,
      channelId: channel.id,
    });

    await this.db.db
      .update(publishLogs)
      .set({
        queueJobId: String(job.id),
        updatedAt: new Date(),
      })
      .where(eq(publishLogs.id, publishLog.id));

    return {
      publishLogId: publishLog.id,
      queueJobId: String(job.id),
      status: 'queued',
    };
  }

  async getPublishLogs(postId: string) {
    return this.db.db
      .select()
      .from(publishLogs)
      .where(eq(publishLogs.generatedPostId, postId));
  }
}
