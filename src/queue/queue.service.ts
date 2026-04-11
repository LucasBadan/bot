import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  MERCADO_LIVRE_SYNC_JOB,
  PUBLISH_GENERATED_POST_JOB,
  PublishGeneratedPostJobData,
  QUEUE_NAME,
} from './queue.constants';
import { PUBLISH_OFFER_JOB, PublishOfferJobData } from './queue.constants';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QUEUE_NAME)
    private readonly queue: Queue,
  ) {}

  async addMercadoLivreJob(data: any) {
    return this.queue.add(MERCADO_LIVRE_SYNC_JOB, data, {
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async enqueuePublishOffer(data: PublishOfferJobData, delayMs: number = 0) {
    return this.queue.add(PUBLISH_OFFER_JOB, data, {
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  async enqueuePublishGeneratedPost(data: PublishGeneratedPostJobData) {
    return this.queue.add(PUBLISH_GENERATED_POST_JOB, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }
}
