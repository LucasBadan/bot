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
  PUBLISH_OFFER_JOB,
  PublishGeneratedPostJobData,
  PublishOfferJobData,
  QUEUE_NAME,
} from './queue.constants';
import { BaileysService } from '../modules/baileys/baileys.service';

@Injectable()
@Processor(QUEUE_NAME)
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name);

  constructor(
    private readonly mercadoLivreService: MercadoLivreService,
    private readonly db: DbService,
    private readonly whatsappService: WhatsappService,
    private readonly baileysService: BaileysService,
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
        this.logger.warn(`Job desconhecido: ${job.name}`);
        return { ignored: true };
    }
  }

  private async handlePublishOffer(job: Job<PublishOfferJobData>) {
    const { groupId, oferta } = job.data;

    this.logger.log(
      `[PublishOffer] Publicando "${oferta.title}" no grupo ${groupId}`,
    );

    const message = this.formatarMensagem(oferta);

    if (oferta.thumbnail) {
      await this.baileysService.sendImage(groupId, oferta.thumbnail, message);
    } else {
      await this.baileysService.sendText(groupId, message);
    }

    this.logger.log(`[PublishOffer] ✅ "${oferta.title}" publicado`);
    return { success: true };
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private formatarMensagem(oferta: PublishOfferJobData['oferta']): string {
    const finalLink = oferta.affiliateLink || oferta.permalink || '';

    const discount =
      oferta.originalPrice && oferta.originalPrice > oferta.price
        ? Math.round(
            ((oferta.originalPrice - oferta.price) / oferta.originalPrice) *
              100,
          )
        : null;

    const header = oferta.isDropped
      ? '📉 *FICOU AINDA MAIS BARATO!*'
      : '🔥 *OFERTA IMPERDÍVEL*';

    const variantLine =
      oferta.variantAlert && oferta.variant
        ? `⚠️ *Apenas: ${oferta.variant}*`
        : oferta.variant
          ? `📦 Modelo: ${oferta.variant}`
          : null;

    const installmentLine = oferta.installments
      ? `💳 *${oferta.installments.quantity}x de ${this.formatCurrency(oferta.installments.amount)} ${oferta.installments.rate}*`
      : null;
    const pixLine = oferta.pixPrice
      ? `💸 *R$ ${oferta.pixPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no Pix*`
      : null;

    return [
      header,
      `🔎 ${oferta.keyword}`,
      '',
      `*${oferta.title}*`,
      variantLine,
      '',
      oferta.originalPrice
        ? `~~De: ${this.formatCurrency(oferta.originalPrice)}~~`
        : null,
      `💰 *Por: ${this.formatCurrency(oferta.price)}*`,
      pixLine,
      discount ? `📉 *${discount}% OFF*` : null,
      installmentLine,
      '',
      '👇 *Compre agora* 👇',
      finalLink,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async handlePublishGeneratedPost(
    job: Job<PublishGeneratedPostJobData>,
  ) {
    const { publishLogId, generatedPostId, channelId } = job.data;

    await this.db.db
      .update(publishLogs)
      .set({ queueJobStatus: 'active', updatedAt: new Date() })
      .where(eq(publishLogs.id, publishLogId));

    const [post] = await this.db.db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.id, generatedPostId));

    if (!post) throw new Error('Generated post not found');

    const [channel] = await this.db.db
      .select()
      .from(publisherChannels)
      .where(eq(publisherChannels.id, channelId));

    if (!channel) throw new Error('Publisher channel not found');
    if (!channel.isActive) throw new Error('Publisher channel is inactive');
    if (channel.type !== 'whatsapp')
      throw new Error(`Unsupported channel type: ${channel.type}`);

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

    return { success: true, publishLogId, messageId: result.messageId ?? null };
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
