import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { MercadoLivreService } from '../modules/mercado-livre/mercado-livre.service';
import { DbService } from '../db/db.service';
import { WhatsappService } from '../publishers/whatsapp/whatsapp.service';
import { generatedPosts, publishLogs, publisherChannels } from '../db/schema';
import {
  MERCADO_LIVRE_SYNC_JOB,
  PUBLISH_GENERATED_POST_JOB,
  PublishGeneratedPostJobData,
  QUEUE_NAME,
} from './queue.constants';

@Injectable()
@Processor(QUEUE_NAME)
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name);

  constructor(
    private readonly mercadoLivreService: MercadoLivreService,
    private readonly db: DbService,
    private readonly whatsappService: WhatsappService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    this.logger.log(`Processando job ${job.id} - ${job.name}`);

    switch (job.name) {
      case MERCADO_LIVRE_SYNC_JOB:
        return {
          skipped: true,
          reason: 'syncProducts pendente de implementação',
        };

      case PUBLISH_GENERATED_POST_JOB:
        return this.handlePublishGeneratedPost(
          job as Job<PublishGeneratedPostJobData>,
        );

      default:
        this.logger.warn(`Job desconhecido: ${job.name}`);
        return { ignored: true };
    }
  }

  private async handlePublishGeneratedPost(
    job: Job<PublishGeneratedPostJobData>,
  ) {
    const { publishLogId, generatedPostId, channelId } = job.data;

    await this.db.db
      .update(publishLogs)
      .set({
        queueJobStatus: 'active',
        updatedAt: new Date(),
      })
      .where(eq(publishLogs.id, publishLogId));

    const [post] = await this.db.db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.id, generatedPostId));

    if (!post) {
      throw new Error('Generated post not found');
    }

    const [channel] = await this.db.db
      .select()
      .from(publisherChannels)
      .where(eq(publisherChannels.id, channelId));

    if (!channel) {
      throw new Error('Publisher channel not found');
    }

    if (!channel.isActive) {
      throw new Error('Publisher channel is inactive');
    }

    if (channel.type !== 'whatsapp') {
      throw new Error(`Unsupported channel type: ${channel.type}`);
    }

    const text = [
      post.title ? `🔥 ${post.title}` : null,
      post.caption ?? null,
      post.callToAction ? `👉 ${post.callToAction}` : null,
      Array.isArray(post.hashtags) && post.hashtags.length
        ? post.hashtags.join(' ')
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this.whatsappService.sendText({
      to: channel.target,
      text,
    });

    await this.db.db
      .update(publishLogs)
      .set({
        status: 'sent',
        queueJobStatus: 'completed',
        externalPostId: result.messageId ?? null,
        payload: result.raw ?? null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(publishLogs.id, publishLogId));

    return {
      success: true,
      publishLogId,
      messageId: result.messageId ?? null,
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job concluído: ${job.id} - ${job.name}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `Job falhou: ${job?.id} - ${job?.name} - ${error.message}`,
    );

    if (job?.name === PUBLISH_GENERATED_POST_JOB && job.data?.publishLogId) {
      await this.db.db
        .update(publishLogs)
        .set({
          status: 'failed',
          queueJobStatus: 'failed',
          retries: job.attemptsMade,
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(publishLogs.id, job.data.publishLogId));
    }
  }
}
