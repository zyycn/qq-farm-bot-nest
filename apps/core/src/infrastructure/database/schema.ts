import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  uin: text('uin').default(''),
  qq: text('qq').default(''),
  name: text('name').default(''),
  nick: text('nick').default(''),
  platform: text('platform').default('qq'),
  code: text('code').default(''),
  avatar: text('avatar').default(''),
  loginType: text('login_type').default('qr'),
  running: integer('running', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'number' }).default(0),
  updatedAt: integer('updated_at', { mode: 'number' }).default(0)
})

export const accountConfigs = sqliteTable('account_configs', {
  accountId: text('account_id').primaryKey().references(() => accounts.id),
  automation: text('automation', { mode: 'json' }).$type<Record<string, any>>().default({}),
  plantingStrategy: text('planting_strategy').default('preferred'),
  preferredSeedId: integer('preferred_seed_id').default(0),
  bagSeedPriority: text('bag_seed_priority', { mode: 'json' }).$type<number[]>().default([]),
  intervals: text('intervals', { mode: 'json' }).$type<Record<string, number>>().default({}),
  friendQuietHours: text('friend_quiet_hours', { mode: 'json' }).$type<Record<string, any>>().default({}),
  friendBlacklist: text('friend_blacklist', { mode: 'json' }).$type<number[]>().default([]),
  stealCropBlacklist: text('steal_crop_blacklist', { mode: 'json' }).$type<number[]>().default([]),
  fertilizer: text('fertilizer').default('none'),
  fertilizerLandTypes: text('fertilizer_land_types', { mode: 'json' }).$type<string[]>().default(['gold', 'black', 'red', 'normal']),
  fertilizerMultiSeason: integer('fertilizer_multi_season', { mode: 'boolean' }).default(false),
  fertilizerBuy: text('fertilizer_buy', { mode: 'json' }).$type<Record<string, any>>().default({}),
  deviceProfileId: text('device_profile_id'),
  createdAt: integer('created_at', { mode: 'number' }).default(0),
  updatedAt: integer('updated_at', { mode: 'number' }).default(0)
})

export const deviceProfiles = sqliteTable('device_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  presetId: text('preset_id'),
  profile: text('profile', { mode: 'json' }).$type<Record<string, any>>().notNull(),
  createdAt: integer('created_at', { mode: 'number' }).default(0),
  updatedAt: integer('updated_at', { mode: 'number' }).default(0)
})

export const globalConfigs = sqliteTable('global_configs', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>(),
  createdAt: integer('created_at', { mode: 'number' }).default(0),
  updatedAt: integer('updated_at', { mode: 'number' }).default(0)
})

export const gameLogs = sqliteTable('game_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').default(''),
  accountName: text('account_name').default(''),
  tag: text('tag').default(''),
  module: text('module').default(''),
  event: text('event').default(''),
  msg: text('msg').default(''),
  isWarn: integer('is_warn', { mode: 'boolean' }).default(false),
  meta: text('meta', { mode: 'json' }).$type<Record<string, any>>().default({}),
  createdAt: integer('created_at', { mode: 'number' }).default(0)
})

export const accountLogs = sqliteTable('account_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: text('account_id').default(''),
  accountName: text('account_name').default(''),
  action: text('action').default(''),
  msg: text('msg').default(''),
  reason: text('reason').default(''),
  extra: text('extra', { mode: 'json' }).$type<Record<string, any>>().default({}),
  createdAt: integer('created_at', { mode: 'number' }).default(0),
  updatedAt: integer('updated_at', { mode: 'number' }).default(0)
})
