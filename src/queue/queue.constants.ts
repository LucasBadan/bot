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

export const PUBLISH_OFFER_JOB = 'publish-offer';

export type PublishOfferJobData = {
  groupId: string;
  oferta: {
    id: string;
    title: string;
    price: number;
    pixPrice?: number | null;
    originalPrice: number | null;
    permalink: string;
    affiliateLink: string | null;
    thumbnail: string | null;
    installments: { quantity: number; amount: number; rate: string } | null;
    keyword: string;
    variant?: string | null;
    variantAlert?: boolean;
    isDropped: boolean;
  };
};
