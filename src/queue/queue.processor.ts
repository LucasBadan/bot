import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { generatedPosts, publishLogs, publisherChannels } from '../db/schema';
import { WhatsappService } from '../publishers/whatsapp/whatsapp.service';
import {
  MERCADO_LIVRE_SYNC_JOB,
  PUBLISH_GENERATED_POST_JOB,
  PUBLISH_OFFER_JOB,
  PublishGeneratedPostJobData,
  PublishOfferJobData,
  QUEUE_NAME,
} from './queue.constants';
import { OfferMessageFormatterService } from './queue-offer-message-formatter-service';

@Injectable()
@Processor(QUEUE_NAME)
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name);

  constructor(
    private readonly db: DbService,
    private readonly whatsappService: WhatsappService,
    private readonly offerMessageFormatter: OfferMessageFormatterService,
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

      case PUBLISH_OFFER_JOB:
        return this.handlePublishOffer(job as Job<PublishOfferJobData>);

      default:
        this.logger.warn(`Job desconhecido ${job.name}`);
        return { ignored: true };
    }
  }

  private async handlePublishOffer(job: Job<PublishOfferJobData>) {
    const { groupId, oferta } = job.data;

    this.logger.log(
      `[PublishOffer] Publicando ${oferta.title} (${oferta.marketplace ?? 'unknown'}) no grupo ${groupId}`,
    );

    const message = this.offerMessageFormatter.format(oferta);

    if (oferta.thumbnail) {
      await this.whatsappService.sendImage({
        to: groupId,
        imageUrl: oferta.thumbnail,
        caption: message,
      });
    } else {
      await this.whatsappService.sendText({
        to: groupId,
        text: message,
      });
    }

    this.logger.log(
      `[PublishOffer] ${oferta.title} publicado com sucesso no grupo ${groupId}`,
    );

    return {
      success: true,
      groupId,
      productId: oferta.id,
      marketplace: oferta.marketplace ?? null,
    };
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

    const post = await this.db.db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.id, generatedPostId));

    if (!post[0]) {
      throw new Error('Generated post not found');
    }

    const channel = await this.db.db
      .select()
      .from(publisherChannels)
      .where(eq(publisherChannels.id, channelId));

    if (!channel[0]) {
      throw new Error('Publisher channel not found');
    }

    if (!channel[0].isActive) {
      throw new Error('Publisher channel is inactive');
    }

    if (channel[0].type !== 'whatsapp') {
      throw new Error(`Unsupported channel type ${channel[0].type}`);
    }

    const text = [
      post[0].title || null,
      post[0].caption || null,
      post[0].callToAction || null,
      Array.isArray(post[0].hashtags) && post[0].hashtags.length
        ? post[0].hashtags.join(' ')
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this.whatsappService.sendText({
      to: channel[0].target,
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
    this.logger.log(`Job concluído ${job.id} - ${job.name}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error) {
    this.logger.error(
      `Job falhou ${job?.id} - ${job?.name} - ${error.message}`,
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
