import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const marketplaceEnum = pgEnum('marketplace', [
  'amazon',
  'shopee',
  'mercado_livre',
  'aliexpress',
  'other',
]);

export const sourceStatusEnum = pgEnum('source_status', [
  'active',
  'inactive',
  'blocked',
  'archived',
]);

export const couponStatusEnum = pgEnum('coupon_status', [
  'active',
  'expired',
  'used',
  'invalid',
]);

export const ruleStatusEnum = pgEnum('rule_status', ['active', 'inactive']);

export const dealStatusEnum = pgEnum('deal_status', [
  'pending',
  'approved',
  'rejected',
  'posted',
]);

export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'ready',
  'published',
  'failed',
]);

export const publishPlatformEnum = pgEnum('publish_platform', [
  'telegram',
  'whatsapp',
  'discord',
  'twitter',
  'instagram',
  'other',
]);

export const publishStatusEnum = pgEnum('publish_status', [
  'queued',
  'sent',
  'failed',
  'cancelled',
]);

export const queueJobStatusEnum = pgEnum('queue_job_status', [
  'waiting',
  'active',
  'completed',
  'failed',
  'paused',
  'delayed',
  'cancelled',
]);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 140 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('categories_slug_uq').on(table.slug),
    uniqueIndex('categories_name_uq').on(table.name),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 280 }).notNull(),
    brand: varchar('brand', { length: 120 }),
    model: varchar('model', { length: 120 }),
    description: text('description'),
    keywords: text('keywords').array(),
    defaultImageUrl: text('default_image_url'),
    isTracked: boolean('is_tracked').default(true).notNull(),
    isApproved: boolean('is_approved').default(true).notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('products_slug_uq').on(table.slug),
    index('products_category_idx').on(table.categoryId),
    index('products_name_idx').on(table.name),
  ],
);

export const productSources = pgTable(
  'product_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    marketplace: marketplaceEnum('marketplace').notNull(),
    externalProductId: varchar('external_product_id', { length: 180 }),
    titleOnStore: varchar('title_on_store', { length: 255 }).notNull(),
    sourceUrl: text('source_url').notNull(),
    canonicalUrl: text('canonical_url'),
    imageUrl: text('image_url'),
    sellerName: varchar('seller_name', { length: 180 }),
    status: sourceStatusEnum('status').default('active').notNull(),
    isMonitored: boolean('is_monitored').default(true).notNull(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastPrice: numeric('last_price', { precision: 12, scale: 2 }),
    lastPriceOld: numeric('last_price_old', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 10 }).default('BRL').notNull(),
    metadata: jsonb('metadata'),
    ...timestamps,
  },
  (table) => [
    index('product_sources_product_idx').on(table.productId),
    index('product_sources_marketplace_idx').on(table.marketplace),
    uniqueIndex('product_sources_source_url_uq').on(table.sourceUrl),
  ],
);

export const affiliateLinks = pgTable(
  'affiliate_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productSourceId: uuid('product_source_id')
      .references(() => productSources.id, { onDelete: 'cascade' })
      .notNull(),
    marketplace: marketplaceEnum('marketplace').notNull(),
    affiliateProgram: varchar('affiliate_program', { length: 120 }),
    originalUrl: text('original_url').notNull(),
    affiliateUrl: text('affiliate_url').notNull(),
    campaignTag: varchar('campaign_tag', { length: 120 }),
    isActive: boolean('is_active').default(true).notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('affiliate_links_source_idx').on(table.productSourceId),
    index('affiliate_links_marketplace_idx').on(table.marketplace),
  ],
);

export const priceHistory = pgTable(
  'price_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productSourceId: uuid('product_source_id')
      .references(() => productSources.id, { onDelete: 'cascade' })
      .notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    listPrice: numeric('list_price', { precision: 12, scale: 2 }),
    shippingPrice: numeric('shipping_price', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 10 }).default('BRL').notNull(),
    inStock: boolean('in_stock').default(true).notNull(),
    installmentInfo: varchar('installment_info', { length: 255 }),
    couponTextSnapshot: text('coupon_text_snapshot'),
    rawPayload: jsonb('raw_payload'),
    ...timestamps,
  },
  (table) => [
    index('price_history_source_idx').on(table.productSourceId),
    index('price_history_captured_at_idx').on(table.capturedAt),
  ],
);

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productSourceId: uuid('product_source_id')
      .references(() => productSources.id, { onDelete: 'cascade' })
      .notNull(),
    code: varchar('code', { length: 120 }),
    title: varchar('title', { length: 180 }),
    description: text('description'),
    discountType: varchar('discount_type', { length: 50 }),
    discountValue: numeric('discount_value', { precision: 12, scale: 2 }),
    minimumOrderValue: numeric('minimum_order_value', {
      precision: 12,
      scale: 2,
    }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: couponStatusEnum('status').default('active').notNull(),
    sourceLabel: varchar('source_label', { length: 120 }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata'),
    ...timestamps,
  },
  (table) => [
    index('coupons_source_idx').on(table.productSourceId),
    index('coupons_status_idx').on(table.status),
  ],
);

export const dealRules = pgTable(
  'deal_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    marketplace: marketplaceEnum('marketplace'),
    minDiscountPercent: numeric('min_discount_percent', {
      precision: 5,
      scale: 2,
    }),
    minDiscountAmount: numeric('min_discount_amount', {
      precision: 12,
      scale: 2,
    }),
    maxPrice: numeric('max_price', { precision: 12, scale: 2 }),
    requireCoupon: boolean('require_coupon').default(false).notNull(),
    requireLowestInPeriod: boolean('require_lowest_in_period')
      .default(false)
      .notNull(),
    lookbackDays: integer('lookback_days').default(30),
    autoApprove: boolean('auto_approve').default(false).notNull(),
    status: ruleStatusEnum('status').default('active').notNull(),
    config: jsonb('config'),
    ...timestamps,
  },
  (table) => [
    index('deal_rules_category_idx').on(table.categoryId),
    index('deal_rules_status_idx').on(table.status),
  ],
);

export const dealCandidates = pgTable(
  'deal_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    productSourceId: uuid('product_source_id')
      .references(() => productSources.id, { onDelete: 'cascade' })
      .notNull(),
    couponId: uuid('coupon_id').references(() => coupons.id, {
      onDelete: 'set null',
    }),
    affiliateLinkId: uuid('affiliate_link_id').references(
      () => affiliateLinks.id,
      { onDelete: 'set null' },
    ),
    matchedRuleId: uuid('matched_rule_id').references(() => dealRules.id, {
      onDelete: 'set null',
    }),
    detectedAt: timestamp('detected_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    previousPrice: numeric('previous_price', { precision: 12, scale: 2 }),
    currentPrice: numeric('current_price', {
      precision: 12,
      scale: 2,
    }).notNull(),
    listPrice: numeric('list_price', { precision: 12, scale: 2 }),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }),
    finalPriceWithCoupon: numeric('final_price_with_coupon', {
      precision: 12,
      scale: 2,
    }),
    headline: varchar('headline', { length: 255 }),
    reasoning: text('reasoning'),
    score: numeric('score', { precision: 6, scale: 2 }),
    imageUrl: text('image_url'),
    status: dealStatusEnum('status').default('pending').notNull(),
    aiInput: jsonb('ai_input'),
    aiSummary: text('ai_summary'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('deal_candidates_product_idx').on(table.productId),
    index('deal_candidates_source_idx').on(table.productSourceId),
    index('deal_candidates_status_idx').on(table.status),
    index('deal_candidates_detected_at_idx').on(table.detectedAt),
  ],
);

export const generatedPosts = pgTable(
  'generated_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dealCandidateId: uuid('deal_candidate_id')
      .references(() => dealCandidates.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    caption: text('caption').notNull(),
    callToAction: varchar('call_to_action', { length: 255 }),
    hashtags: text('hashtags').array(),
    imageUrl: text('image_url'),
    imagePrompt: text('image_prompt'),
    modelName: varchar('model_name', { length: 120 }),
    status: postStatusEnum('status').default('draft').notNull(),
    metadata: jsonb('metadata'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('generated_posts_deal_idx').on(table.dealCandidateId),
    index('generated_posts_status_idx').on(table.status),
  ],
);

export const monitorKeywords = pgTable('monitor_keywords', {
  id: uuid('id').defaultRandom().primaryKey(),
  term: varchar('term', { length: 160 }).notNull(),
  marketplace: marketplaceEnum('marketplace').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  ...timestamps,
});

export const publishLogs = pgTable(
  'publish_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generatedPostId: uuid('generated_post_id')
      .references(() => generatedPosts.id, { onDelete: 'cascade' })
      .notNull(),
    platform: publishPlatformEnum('platform').notNull(),
    destination: varchar('destination', { length: 255 }),
    externalPostId: varchar('external_post_id', { length: 255 }),
    publishedUrl: text('published_url'),
    status: publishStatusEnum('status').default('queued').notNull(),
    queueJobId: varchar('queue_job_id', { length: 255 }),
    queueJobStatus: queueJobStatusEnum('queue_job_status'),
    retries: integer('retries').default(0).notNull(),
    errorMessage: text('error_message'),
    payload: jsonb('payload'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('publish_logs_generated_post_idx').on(table.generatedPostId),
    index('publish_logs_platform_idx').on(table.platform),
    index('publish_logs_status_idx').on(table.status),
    index('publish_logs_queue_job_id_idx').on(table.queueJobId),
  ],
);

export const publisherChannels = pgTable(
  'publisher_channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: publishPlatformEnum('type').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    target: text('target').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    configJson: jsonb('config_json'),
    ...timestamps,
  },
  (table) => [
    index('publisher_channels_type_idx').on(table.type),
    index('publisher_channels_active_idx').on(table.isActive),
    uniqueIndex('publisher_channels_type_target_uq').on(
      table.type,
      table.target,
    ),
  ],
);

export const marketplaceAccounts = pgTable(
  'marketplace_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    platform: marketplaceEnum('platform').notNull(),
    externalUserId: text('external_user_id'),
    nickname: text('nickname'),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenType: text('token_type').notNull(),
    expiresIn: integer('expires_in').notNull(),
    scope: text('scope'),
    redirectUri: text('redirect_uri'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata'),
  },
  (table) => [
    index('marketplace_accounts_platform_idx').on(table.platform),
    index('marketplace_accounts_external_user_idx').on(table.externalUserId),
    uniqueIndex('marketplace_accounts_platform_external_user_uq').on(
      table.platform,
      table.externalUserId,
    ),
  ],
);

// RELATIONS

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
  rules: many(dealRules),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  sources: many(productSources),
  dealCandidates: many(dealCandidates),
}));

export const productSourcesRelations = relations(
  productSources,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productSources.productId],
      references: [products.id],
    }),
    priceHistory: many(priceHistory),
    coupons: many(coupons),
    affiliateLinks: many(affiliateLinks),
    dealCandidates: many(dealCandidates),
  }),
);

export const affiliateLinksRelations = relations(
  affiliateLinks,
  ({ one, many }) => ({
    productSource: one(productSources, {
      fields: [affiliateLinks.productSourceId],
      references: [productSources.id],
    }),
    dealCandidates: many(dealCandidates),
  }),
);

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  productSource: one(productSources, {
    fields: [priceHistory.productSourceId],
    references: [productSources.id],
  }),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  productSource: one(productSources, {
    fields: [coupons.productSourceId],
    references: [productSources.id],
  }),
  dealCandidates: many(dealCandidates),
}));

export const dealRulesRelations = relations(dealRules, ({ one, many }) => ({
  category: one(categories, {
    fields: [dealRules.categoryId],
    references: [categories.id],
  }),
  dealCandidates: many(dealCandidates),
}));

export const dealCandidatesRelations = relations(
  dealCandidates,
  ({ one, many }) => ({
    product: one(products, {
      fields: [dealCandidates.productId],
      references: [products.id],
    }),
    productSource: one(productSources, {
      fields: [dealCandidates.productSourceId],
      references: [productSources.id],
    }),
    coupon: one(coupons, {
      fields: [dealCandidates.couponId],
      references: [coupons.id],
    }),
    affiliateLink: one(affiliateLinks, {
      fields: [dealCandidates.affiliateLinkId],
      references: [affiliateLinks.id],
    }),
    matchedRule: one(dealRules, {
      fields: [dealCandidates.matchedRuleId],
      references: [dealRules.id],
    }),
    generatedPosts: many(generatedPosts),
  }),
);

export const generatedPostsRelations = relations(
  generatedPosts,
  ({ one, many }) => ({
    dealCandidate: one(dealCandidates, {
      fields: [generatedPosts.dealCandidateId],
      references: [dealCandidates.id],
    }),
    publishLogs: many(publishLogs),
  }),
);

export const publishLogsRelations = relations(publishLogs, ({ one }) => ({
  generatedPost: one(generatedPosts, {
    fields: [publishLogs.generatedPostId],
    references: [generatedPosts.id],
  }),
}));
