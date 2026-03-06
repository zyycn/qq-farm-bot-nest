import fs from 'node:fs'
import path from 'node:path'
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

      CREATE TABLE IF NOT EXISTS account_configs (
        account_id TEXT PRIMARY KEY,
        automation TEXT DEFAULT '{}',
        planting_strategy TEXT DEFAULT 'preferred',
        preferred_seed_id INTEGER DEFAULT 0,
        intervals TEXT DEFAULT '{}',
        friend_quiet_hours TEXT DEFAULT '{}',
        friend_blacklist TEXT DEFAULT '[]',
        steal_crop_blacklist TEXT DEFAULT '[]',
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS global_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS logs (
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

      CREATE INDEX IF NOT EXISTS idx_logs_account_id ON logs(account_id);
    `)

    // Migrate existing DB: ts -> created_at, add updated_at where missing; then ensure new indexes exist
    try {
      const logInfo = sqlite.prepare('PRAGMA table_info(logs)').all() as { name: string }[]
      if (logInfo.some((c: { name: string }) => c.name === 'ts')) {
        sqlite.exec('ALTER TABLE logs RENAME COLUMN ts TO created_at')
        sqlite.exec('DROP INDEX IF EXISTS idx_logs_ts')
        sqlite.exec('DROP INDEX IF EXISTS idx_logs_account_ts')
        sqlite.exec('DROP INDEX IF EXISTS idx_logs_account_module_event_ts')
      }
      const alInfo = sqlite.prepare('PRAGMA table_info(account_logs)').all() as { name: string }[]
      if (alInfo.some((c: { name: string }) => c.name === 'ts')) {
        sqlite.exec('ALTER TABLE account_logs RENAME COLUMN ts TO created_at')
        sqlite.exec('DROP INDEX IF EXISTS idx_account_logs_ts')
        sqlite.exec('DROP INDEX IF EXISTS idx_account_logs_account_ts')
      }
      if (!alInfo.some((c: { name: string }) => c.name === 'updated_at')) {
        sqlite.exec('ALTER TABLE account_logs ADD COLUMN updated_at INTEGER DEFAULT 0')
      }
      const acInfo = sqlite.prepare('PRAGMA table_info(account_configs)').all() as { name: string }[]
      if (!acInfo.some((c: { name: string }) => c.name === 'created_at')) {
        sqlite.exec('ALTER TABLE account_configs ADD COLUMN created_at INTEGER DEFAULT 0')
        sqlite.exec('ALTER TABLE account_configs ADD COLUMN updated_at INTEGER DEFAULT 0')
      }
      const gcInfo = sqlite.prepare('PRAGMA table_info(global_config)').all() as { name: string }[]
      if (!gcInfo.some((c: { name: string }) => c.name === 'created_at')) {
        sqlite.exec('ALTER TABLE global_config ADD COLUMN created_at INTEGER DEFAULT 0')
        sqlite.exec('ALTER TABLE global_config ADD COLUMN updated_at INTEGER DEFAULT 0')
      }
      sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_logs_account_created_at ON logs(account_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_logs_account_module_event_created_at ON logs(account_id, module, event, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_account_logs_created_at ON account_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_account_logs_account_created_at ON account_logs(account_id, created_at DESC);
      `)
    } catch {}

    return db
  }
}

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>
