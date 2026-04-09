export const QUEUE_NAME = 'default';

// Jobs de sync por plataforma
export const MERCADO_LIVRE_SYNC_JOB = 'mercado-livre-sync';
export const SHOPEE_SYNC_JOB = 'shopee-sync';
export const AMAZON_SYNC_JOB = 'amazon-sync';

// Jobs de publicação
export const PUBLISH_GENERATED_POST_JOB = 'publish-generated-post';

export type PublishGeneratedPostJobData = {
  publishLogId: string;
  generatedPostId: string;
  channelId: string;
};
