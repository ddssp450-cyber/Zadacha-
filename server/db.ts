import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const configuredDbPath = (process.env.DB_PATH || '').trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.resolve(projectRoot, 'data', 'building-brain.sqlite');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    email_lower TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    role_title TEXT NOT NULL DEFAULT 'Потребител',
    avatar_url TEXT NOT NULL DEFAULT '',
    active_building_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
    ON users(email_lower)
    WHERE email_lower <> '';

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_email TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL DEFAULT '',
    total_floors INTEGER NOT NULL DEFAULT 1,
    total_apartments INTEGER NOT NULL DEFAULT 0,
    occupied_apartments INTEGER NOT NULL DEFAULT 0,
    year_built INTEGER NOT NULL,
    reserve_fund_balance REAL NOT NULL DEFAULT 0,
    monthly_collection_rate REAL NOT NULL DEFAULT 0,
    exterior_image TEXT NOT NULL DEFAULT '',
    lobby_image TEXT NOT NULL DEFAULT '',
    facilities_json TEXT NOT NULL DEFAULT '[]',
    contact_manager TEXT NOT NULL DEFAULT '',
    phone_manager TEXT NOT NULL DEFAULT '',
    iban TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS building_members (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    apartment_number TEXT,
    name TEXT,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT,
    invite_id TEXT,
    joined_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_building ON building_members(building_id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON building_members(user_id);

  CREATE TABLE IF NOT EXISTS building_invites (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    building_name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT,
    name TEXT,
    role TEXT NOT NULL,
    apartment_number TEXT,
    lookup_hashes_json TEXT NOT NULL DEFAULT '[]',
    claimed_uids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_invites_building ON building_invites(building_id);

  CREATE TABLE IF NOT EXISTS building_records (
    id TEXT PRIMARY KEY,
    building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    subcol TEXT NOT NULL,
    created_by_uid TEXT NOT NULL DEFAULT '',
    apartment_number TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_building_subcol ON building_records(building_id, subcol);
`);

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'ddssp450@gmail.com').trim().toLowerCase();

export interface DbUser {
  id: string;
  name: string;
  email: string;
  email_lower: string;
  phone: string;
  password_hash: string | null;
  is_anonymous: number;
  role_title: string;
  avatar_url: string;
  active_building_id: string | null;
  created_at: string;
  updated_at: string;
}

export function makeId(prefix: string): string {
  const rand = crypto.randomBytes(5).toString('hex');
  return `${prefix}-${Date.now()}-${rand}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function uniqueStrings(items: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      set.add(item.trim());
    }
  }
  return Array.from(set);
}

export function normalizePhoneVariants(rawPhone: string): string[] {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 6) return [];

  const variants = new Set<string>();
  variants.add(digits);

  let localDigits = digits;
  if (digits.startsWith('00359') && digits.length >= 12) {
    localDigits = digits.slice(5);
  } else if (digits.startsWith('359') && digits.length >= 11) {
    localDigits = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length >= 9) {
    localDigits = digits.slice(1);
  }

  if (localDigits.length >= 6) {
    variants.add(localDigits);
    variants.add(`0${localDigits}`);
    variants.add(`359${localDigits}`);
    variants.add(`+359${localDigits}`);
    variants.add(`00359${localDigits}`);
  }

  return Array.from(variants).map((v) => `phone:${v}`);
}

export function buildIdentifierTokens(input: { email?: string; phone?: string; name?: string }): string[] {
  const tokens: string[] = [];
  const emailLower = (input.email || '').trim().toLowerCase();
  if (emailLower && emailLower.includes('@')) {
    tokens.push(`email:${emailLower}`);
  }
  if (input.phone && input.phone.trim()) {
    tokens.push(...normalizePhoneVariants(input.phone));
  }
  const normName = (input.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (normName.length >= 2) {
    tokens.push(`name:${normName}`);
  }
  return uniqueStrings(tokens).slice(0, 20);
}

export function buildQueryTokensFromSingleInput(identifier: string): string[] {
  const trimmed = identifier.trim();
  if (!trimmed) return [];
  const tokens: string[] = [];
  if (trimmed.includes('@')) {
    tokens.push(`email:${trimmed.toLowerCase()}`);
  }
  tokens.push(...normalizePhoneVariants(trimmed));
  const normName = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (normName.length >= 2) {
    tokens.push(`name:${normName}`);
  }
  return uniqueStrings(tokens).slice(0, 20);
}

export function buildLookupHashes(tokens: string[]): string[] {
  return uniqueStrings(tokens.map((t) => sha256Hex(t))).slice(0, 20);
}

export function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback error
    }
    throw err;
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, userId, now + SESSION_TTL_MS, new Date(now).toISOString());
  return token;
}

export function getSessionUser(rawToken: string | null | undefined): DbUser | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = sha256Hex(rawToken);
  const row = db
    .prepare(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, Date.now()) as unknown as DbUser | undefined;
  return row || null;
}

export function revokeSession(rawToken: string | null | undefined): void {
  if (!rawToken) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(rawToken));
}

export function isUserAdmin(user: DbUser): boolean {
  return user.is_anonymous === 0 && Boolean(user.email_lower) && user.email_lower === ADMIN_EMAIL;
}

export function toPublicUser(user: DbUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.is_anonymous ? '' : user.email,
    phone: user.phone,
    roleTitle: user.role_title,
    avatarUrl: user.avatar_url,
    activeBuildingId: user.active_building_id || undefined,
    isAnonymous: Boolean(user.is_anonymous),
    isAdmin: isUserAdmin(user),
  };
}
