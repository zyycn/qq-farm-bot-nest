import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_REMOTE_LOGIN_KEY } from '@qq-farm/shared'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export const DRIZZLE_TOKEN = 'DRIZZLE_DB'

function getDataDir(): string {
  const root = path.join(__dirname, '../..')
  const dir = path.join(root, 'data')
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })
  return dir
}

export const drizzleProvider = {
  provide: DRIZZLE_TOKEN,
  useFactory: () => {
    const dbPath = path.join(getDataDir(), 'farm.db')
    const sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')

    const db = drizzle(sqlite, { schema })

    // Auto-create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        uin TEXT DEFAULT '',
        qq TEXT DEFAULT '',
        name TEXT DEFAULT '',
        nick TEXT DEFAULT '',
        platform TEXT DEFAULT 'qq',
        code TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        login_type TEXT DEFAULT 'qr',
        running INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_uin_platform ON accounts(uin, platform);

      CREATE TABLE IF NOT EXISTS account_configs (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        automation TEXT DEFAULT '{}',
        planting_strategy TEXT DEFAULT 'preferred',
        preferred_seed_id INTEGER DEFAULT 0,
        bag_seed_priority TEXT DEFAULT '[]',
        intervals TEXT DEFAULT '{}',
        friend_quiet_hours TEXT DEFAULT '{}',
        friend_blacklist TEXT DEFAULT '[]',
        steal_crop_blacklist TEXT DEFAULT '[]',
        fertilizer TEXT DEFAULT 'none',
        fertilizer_land_types TEXT DEFAULT '["gold","black","red","normal"]',
        fertilizer_multi_season INTEGER DEFAULT 0,
        fertilizer_buy TEXT DEFAULT '{}',
        device_profile_id TEXT,
        behavior TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS device_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        preset_id TEXT,
        profile TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS global_configs (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS game_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT DEFAULT '',
        account_name TEXT DEFAULT '',
        tag TEXT DEFAULT '',
        module TEXT DEFAULT '',
        event TEXT DEFAULT '',
        msg TEXT DEFAULT '',
        is_warn INTEGER DEFAULT 0,
        meta TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_game_logs_account_id ON game_logs(account_id);
      CREATE INDEX IF NOT EXISTS idx_game_logs_created_at ON game_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_game_logs_account_created_at ON game_logs(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_game_logs_account_module_event_created_at ON game_logs(account_id, module, event, created_at DESC);

      CREATE TABLE IF NOT EXISTS account_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT DEFAULT '',
        account_name TEXT DEFAULT '',
        action TEXT DEFAULT '',
        msg TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        extra TEXT DEFAULT '{}',
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_account_logs_created_at ON account_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_account_logs_account_created_at ON account_logs(account_id, created_at DESC);
    `)

    // 初始化默认远程登录密钥（若不存在）
    const now = Date.now()
    sqlite.prepare(`
      INSERT INTO global_configs(key, value, created_at, updated_at)
      SELECT @key, @value, @createdAt, @updatedAt
      WHERE NOT EXISTS (SELECT 1 FROM global_configs WHERE key = @key);
    `).run({
      key: 'remoteLoginKey',
      value: JSON.stringify(DEFAULT_REMOTE_LOGIN_KEY),
      createdAt: now,
      updatedAt: now
    })

    return db
  }
}

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>
