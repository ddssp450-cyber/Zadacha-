import 'dotenv/config';
import { Router, type Request, type Response, type NextFunction } from 'express';
import mysql, { type Pool as MySqlPool, type PoolConnection } from 'mysql2/promise';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import {
    USER_PROFILES,
    INITIAL_BUILDINGS,
    INITIAL_APARTMENTS,
    INITIAL_PAYMENTS,
    INITIAL_APPLIANCES,
    INITIAL_REPAIR_TICKETS,
    INITIAL_DEFECTS,
    INITIAL_CALENDAR_EVENTS,
    INITIAL_EXPENSES,
} from './src/data/mockData.ts';
import type { Building, UserProfile, UserRole } from './src/types/index.ts';
import { isValidPhone } from './src/validation.ts';

// MySQL 8 connection. Credentials are read only on the server from DATABASE_URL or MYSQL_* env vars.
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const mysqlPool: MySqlPool = mysql.createPool({
    host: dbUrl?.hostname || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(dbUrl?.port || process.env.MYSQL_PORT || 3306),
    user: dbUrl ? decodeURIComponent(dbUrl.username) : (process.env.MYSQL_USER || 'ninja'),
    password: dbUrl ? decodeURIComponent(dbUrl.password) : (process.env.MYSQL_PASSWORD || 'change-me'),
    database: dbUrl ? decodeURIComponent(dbUrl.pathname.replace(/^\//, '')) : (process.env.MYSQL_DATABASE || 'ninja'),
    waitForConnections: true, connectionLimit: 10, queueLimit: 0,
    charset: 'utf8mb4', timezone: 'Z', decimalNumbers: true,
});

type DbResult = { rows: any[]; rowCount: number };
function mysqlSql(sql: string): string {
    return sql
      .replace(/::int/g, '')
      .replace(/::jsonb/g, '')
      .replace(/now\(\) \+ interval '(\d+) days'/gi, 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL $1 DAY)')
      .replace(/u\.profile->>'([^']+)'/g, "JSON_UNQUOTE(JSON_EXTRACT(u.profile, '$.$1'))")
      .replace(/b\.data->>'([^']+)'/g, "JSON_UNQUOTE(JSON_EXTRACT(b.data, '$.$1'))")
      .replace(/profile->>'([^']+)'/g, "JSON_UNQUOTE(JSON_EXTRACT(profile, '$.$1'))")
      .replace(/data->>'([^']+)'/g, "JSON_UNQUOTE(JSON_EXTRACT(data, '$.$1'))");
}
function bindParams(sql: string, params: any[] = []) {
    const values: any[] = [];
    const text = sql.replace(/\$(\d+)/g, (_match, index) => { values.push(params[Number(index) - 1]); return '?'; });
    return { text: mysqlSql(text), values: normalizeParams(values) };
}
function normalizeParams(params: any[] = []) {
    return params.map(v => v && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Date) ? JSON.stringify(v) : v);
}
async function runQuery(conn: { query: Function }, sql: string, params: any[] = []): Promise<DbResult> {
    const bound = bindParams(sql, params);
    const [result] = await conn.query(bound.text, bound.values);
    if (Array.isArray(result)) return { rows: result, rowCount: result.length };
    return { rows: result.insertId ? [{ insertId: result.insertId }] : [], rowCount: result.affectedRows ?? 0 };
}
export const pool = {
    query: (sql: string, params?: any[]) => runQuery(mysqlPool, sql, params),
    connect: async () => {
        const conn: PoolConnection = await mysqlPool.getConnection();
        return {
            query: (sql: string, params?: any[]) => {
                const normalized = sql.trim().toLowerCase();
                if (normalized === 'begin') return conn.beginTransaction().then(() => ({ rows: [], rowCount: 0 }));
                if (normalized === 'commit') return conn.commit().then(() => ({ rows: [], rowCount: 0 }));
                if (normalized === 'rollback') return conn.rollback().then(() => ({ rows: [], rowCount: 0 }));
                return runQuery(conn, sql, params);
            },
            release: () => conn.release(),
        };
    },
    end: () => mysqlPool.end(),
};

const ROLES: UserRole[] = ['owner', 'tenant', 'builder', 'craftsman'];
const DEMO_PW: Record<UserRole, string> = {
    owner: 'admin123',
    tenant: 'tenant123',
    builder: 'builder123',
    craftsman: 'master123',
};
const MIN_PW = 8;
// Site administrators (comma-separated emails, set with kuso env). They see every user and building.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const isAdmin = (req: AuthedRequest) => !!req.email && ADMIN_EMAILS.includes(req.email);
const SESSION_DAYS = 30;

function hashPw(pw: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

function checkPw(pw: string, stored: string): boolean {
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(pw, salt, 64);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- data model ----------

// API collection name -> the demo rows the demo building starts with.
const COLLECTIONS: Record<string, { id: string }[]> = {
    buildings: INITIAL_BUILDINGS,
    apartments: INITIAL_APARTMENTS,
    payments: INITIAL_PAYMENTS,
    appliances: INITIAL_APPLIANCES,
    repairTickets: INITIAL_REPAIR_TICKETS,
    defects: INITIAL_DEFECTS,
    calendarEvents: INITIAL_CALENDAR_EVENTS,
    expenses: INITIAL_EXPENSES,
};

// What each role may do with each collection inside a building it belongs to. Missing = not visible.
type Level = 'read' | 'write';
const ACCESS: Record<UserRole, Record<string, Level>> = {
    owner: Object.fromEntries(Object.keys(COLLECTIONS).map((c) => [c, 'write' as Level])),
    builder: { apartments: 'read', appliances: 'write', repairTickets: 'write', defects: 'write', calendarEvents: 'write' },
    craftsman: { apartments: 'read', appliances: 'write', repairTickets: 'write', calendarEvents: 'write' },
    // Tenant writes are narrowed further in PUT: meter readings, proof of payment on own bills, new tickets only.
    tenant: { apartments: 'write', payments: 'write', appliances: 'read', repairTickets: 'write', calendarEvents: 'read' },
};

// Tenants only see rows about their own apartment, plus common-area tickets and events meant for tenants.
function tenantSees(collection: string, d: any, apt?: string): boolean {
    switch (collection) {
        case 'apartments':
            return d.number === apt;
        case 'payments':
            return d.apartmentNumber === apt;
        case 'repairTickets':
            return !d.apartmentNumber || d.apartmentNumber === apt;
        case 'calendarEvents':
            return d.assignedRole === 'all' || d.assignedRole === 'tenant' || d.apartmentNumber === apt;
        default:
            return true;
    }
}
// ...but may only change rows that are explicitly theirs.
const tenantOwns = (d: any, apt?: string) => !!apt && (d.number === apt || d.apartmentNumber === apt);

const SCHEMA = `
create table if not exists users (
  id varchar(191) primary key, email varchar(320) not null unique, pw_hash text not null,
  profile json not null, created_at timestamp(3) not null default current_timestamp(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
create table if not exists sessions (
  token_hash char(64) primary key, user_id varchar(191) not null, expires_at datetime(3) not null,
  active_building_id varchar(191) null, index idx_sessions_user(user_id), index idx_sessions_expiry(expires_at),
  constraint fk_sessions_user foreign key(user_id) references users(id) on delete cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
create table if not exists memberships (
  building_id varchar(191) not null, email varchar(320) not null, role varchar(32) not null, apartment_number varchar(64),
  primary key(building_id,email), index idx_memberships_email(email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
create table if not exists building_records (
  building_id varchar(191) not null, collection varchar(64) not null, id varchar(191) not null,
  seq bigint unsigned not null auto_increment, data json not null, updated_at timestamp(3) not null default current_timestamp(3) on update current_timestamp(3),
  primary key(building_id,collection,id), unique key uq_records_seq(seq), index idx_records_building_collection(building_id,collection)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

type Queryable = { query: (text: string, params?: any[]) => Promise<DbResult> };

// Demo rows (optionally for one building), reversed so the first seed row lists first (seq desc).
const seedRows = (onlyBuilding?: string) =>
    Object.entries(COLLECTIONS)
        .flatMap(([c, seed]) => [...seed].reverse().map((d: any) => ({ b: c === 'buildings' ? d.id : d.buildingId, c, d })))
        .filter((r) => !onlyBuilding || r.b === onlyBuilding);

async function insertSeed(q: Queryable, rows: ReturnType<typeof seedRows>) {
    for (const r of rows) {
        await q.query(
            'insert ignore into building_records (building_id, collection, id, data) values ($1, $2, $3, $4)',
            [r.b, r.c, r.d.id, r.d]
        );
    }
}

export async function initDb() {
    const client = await pool.connect();
    try {
        await client.query('begin');
        for (const statement of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await client.query(statement);
        const { rows: users } = await client.query('select count(*)::int as n from users');
        if (users[0].n === 0) {
            for (const u of USER_PROFILES) {
                await client.query(
                    'insert ignore into users (id, email, pw_hash, profile) values ($1, $2, $3, $4)',
                    [u.id, u.email.toLowerCase(), hashPw(DEMO_PW[u.role]), u]
                );
            }
            console.log('Database seeded with demo users.');
        }
        const { rows: records } = await client.query('select count(*)::int as n from building_records');
        if (records[0].n === 0) {
            await insertSeed(client, seedRows());
            for (const u of USER_PROFILES) {
                await client.query(
                    'insert into memberships (building_id, email, role, apartment_number) values ($1, $2, $3, $4) on duplicate key update role = values(role), apartment_number = values(apartment_number)',
                    [u.buildingId, u.email.toLowerCase(), u.role, u.apartmentNumber ?? null]
                );
            }
            console.log('Database seeded with the demo building.');
        }
        await client.query('commit');
        console.log('Successfully connected to MySQL database.');
    } catch (err) {
        await client.query('rollback');
        throw err;
    } finally {
        client.release();
    }
}

// ---------- email ----------

// Gmail SMTP (needs an app password). Without SMTP_USER/SMTP_PASS (local dev) mails are only logged.
const mailer =
    process.env.SMTP_USER && process.env.SMTP_PASS
        ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
        : null;

async function sendMail(to: string, subject: string, text: string) {
    if (!mailer) return console.log(`[mail not configured] to ${to}: ${subject}\n${text}`);
    await mailer.sendMail({ from: `Building Brain <${process.env.SMTP_USER}>`, to, subject, text });
}

const appUrl = (req: Request) =>
    process.env.APP_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;

// ---------- sessions ----------

const COOKIE = 'bb_sid';

function readCookie(req: Request): string | undefined {
    const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
    return match?.[1];
}

async function startSession(res: Response, userId: string) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
        `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`,
        [sha256(token), userId]
    );
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`
    );
}

export interface AuthedRequest extends Request {
    user?: UserProfile;
    email?: string;
    activeBuildingId?: string | null;
    tokenHash?: string;
}

export async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
    try {
        const token = readCookie(req);
        if (token) {
            const { rows } = await pool.query(
                `select u.profile, u.email, s.active_building_id
           from sessions s join users u on u.id = s.user_id
          where s.token_hash = $1 and s.expires_at > now()`,
                [sha256(token)]
            );
            if (rows[0]) {
                req.user = rows[0].profile;
                req.email = rows[0].email;
                req.activeBuildingId = rows[0].active_building_id;
                req.tokenHash = sha256(token);
                return next();
            }
        }
        res.status(401).json({ error: 'Влез в профила си.' });
    } catch (err) {
        next(err);
    }
}

interface Access {
    buildingId: string;
    role: UserRole;
    apartmentNumber?: string;
}

// The user's role in the active building (or their first building).
async function membership(req: AuthedRequest): Promise<Access | null> {
    const { rows } = await pool.query(
        `select building_id, role, apartment_number from memberships
      where email = $1 order by (building_id = $2) desc, building_id limit 1`,
        [req.email, req.activeBuildingId ?? '']
    );
    return rows[0] ? { buildingId: rows[0].building_id, role: rows[0].role, apartmentNumber: rows[0].apartment_number ?? undefined } : null;
}

// ---------- routes ----------

type Handler = (req: AuthedRequest, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: AuthedRequest, res: Response) =>
    fn(req, res).catch((err) => {
        console.error(err);
        res.status(500).json({ error: 'Грешка в базата данни.' });
    });

const str = (v: unknown) => String(v ?? '').trim();
const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const NO_ACCESS = 'Нямаш права за това.';

export const dbRouter = Router();

dbRouter.post(
    '/api/auth/login',
    h(async (req, res) => {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const pw = String(req.body?.password || '');
        const { rows } = await pool.query('select id, pw_hash, profile from users where email = $1', [email]);
        if (!rows[0] || !checkPw(pw, rows[0].pw_hash)) {
            return res.status(401).json({ error: 'Грешен имейл или парола.' });
        }
        await startSession(res, rows[0].id);
        res.json({ user: rows[0].profile });
    })
);

dbRouter.post(
    '/api/auth/register',
    h(async (req, res) => {
        const b = req.body || {};
        const email = String(b.email || '').trim().toLowerCase();
        const pw = String(b.password || '');
        const name = String(b.name || '').trim();
        const phone = String(b.phone || '').trim();
        if (!name) return res.status(400).json({ error: 'Напиши име и фамилия.' });
        if (!email.includes('@')) return res.status(400).json({ error: 'Тоя имейл не изглежда наред.' });
        if (!isValidPhone(phone)) return res.status(400).json({ error: 'Телефонът трябва да е български номер, напр. +359 88 123 4567.' });
        if (pw.length < MIN_PW) return res.status(400).json({ error: `Паролата трябва да бъде поне ${MIN_PW} символа.` });
        if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Невалидна роля.' });

        // Role and building come from memberships; these are only defaults until the user joins a building.
        const profile: UserProfile = {
            id: `user-${crypto.randomUUID()}`,
            name,
            email,
            phone,
            role: b.role,
            roleTitle: String(b.roleTitle || ''),
            buildingId: '',
            apartmentNumber: b.role === 'tenant' ? String(b.apartmentNumber || '') : undefined,
            companyName: String(b.companyName || '').trim() || undefined,
            avatarUrl: String(b.avatarUrl || ''),
        };
        const { rowCount } = await pool.query(
            'insert ignore into users (id, email, pw_hash, profile) values ($1, $2, $3, $4)',
            [profile.id, email, hashPw(pw), profile]
        );
        if (!rowCount) {
            return res.status(409).json({ error: 'Вече съществува регистриран профил с този имейл адрес. Моля, влезте в профила си.' });
        }
        await startSession(res, profile.id);
        res.json({ user: profile });
    })
);

dbRouter.post(
    '/api/auth/logout',
    h(async (req, res) => {
        const token = readCookie(req);
        if (token) await pool.query('delete from sessions where token_hash = $1', [sha256(token)]);
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
        res.json({ ok: true });
    })
);

dbRouter.use(
    ['/api/state', '/api/data', '/api/expenses', '/api/reset', '/api/ai', '/api/buildings', '/api/active-building', '/api/members', '/api/admin'],
    requireUser
);

dbRouter.get(
    '/api/state',
    h(async (req, res) => {
        // Building creation follows the role chosen at registration, not the role inside a building.
        const state: Record<string, any> = {
            user: req.user,
            isAdmin: isAdmin(req),
            canCreateBuildings: req.user!.role === 'owner' || isAdmin(req),
            activeBuildingId: null,
            members: [],
        };
        for (const name of Object.keys(COLLECTIONS)) state[name] = [];
        const access = await membership(req);
        if (!access) return res.json(state);

        const { rows: mine } = await pool.query(
            `select r.data from memberships m
         join building_records r on r.building_id = m.building_id and r.collection = 'buildings' and r.id = m.building_id
        where m.email = $1 order by r.seq desc`,
            [req.email]
        );
        state.buildings = mine.map((r) => r.data);
        state.activeBuildingId = access.buildingId;
        state.user = {
            ...req.user,
            role: access.role,
            buildingId: access.buildingId,
            apartmentNumber: access.apartmentNumber,
            apartmentId: access.apartmentNumber ? `apt-${access.apartmentNumber}` : undefined,
        };

        const rules = ACCESS[access.role];
        const { rows } = await pool.query(
            `select collection, data from building_records where building_id = $1 and collection <> 'buildings' order by seq desc`,
            [access.buildingId]
        );
        for (const r of rows) {
            if (!rules[r.collection]) continue;
            if (access.role === 'tenant' && !tenantSees(r.collection, r.data, access.apartmentNumber)) continue;
            state[r.collection].push(r.data);
        }

        if (access.role === 'owner') {
            const { rows: members } = await pool.query(
                `select m.email, m.role, m.apartment_number as apartmentNumber, JSON_UNQUOTE(JSON_EXTRACT(u.profile, '$.name')) as name
           from memberships m left join users u on u.email = m.email
          where m.building_id = $1 order by m.role, m.email`,
                [access.buildingId]
            );
            state.members = members;
        }
        res.json(state);
    })
);

dbRouter.put(
    '/api/data/:collection/:id',
    h(async (req, res) => {
        const collection = req.params.collection;
        let record = req.body;
        if (!COLLECTIONS[collection]) return res.status(404).json({ error: 'Непознат вид данни.' });
        if (!record || typeof record !== 'object' || Array.isArray(record) || record.id !== req.params.id) {
            return res.status(400).json({ error: 'Невалиден запис.' });
        }
        const access = await membership(req);
        if (!access || ACCESS[access.role][collection] !== 'write') return res.status(403).json({ error: NO_ACCESS });
        // A building's own record must be the active building; everything else is pinned to it.
        if (collection === 'buildings' && record.id !== access.buildingId) return res.status(403).json({ error: NO_ACCESS });
        if (collection !== 'buildings') record.buildingId = access.buildingId;

        if (access.role === 'tenant') {
            const { rows } = await pool.query(
                'select data from building_records where building_id = $1 and collection = $2 and id = $3',
                [access.buildingId, collection, record.id]
            );
            const existing = rows[0]?.data;
            if (collection === 'apartments') {
                // Only meter readings on their own apartment; rent, status etc. stay as the owner set them.
                if (!existing || !tenantOwns(existing, access.apartmentNumber)) return res.status(403).json({ error: NO_ACCESS });
                const { waterMeterReading, electricMeterReading, lastMeterUpdate } = record;
                record = { ...existing, waterMeterReading, electricMeterReading, lastMeterUpdate };
            } else if (collection === 'payments') {
                // Only submit proof on an existing own bill; amount, due date etc. stay as the owner set them.
                if (!existing || !tenantOwns(existing, access.apartmentNumber)) return res.status(403).json({ error: NO_ACCESS });
                const { paidAmount, paidAt, proofUrl, proofType, proofExtractedData } = record;
                record = { ...existing, status: 'pending_verification', paidAmount, paidAt, proofUrl, proofType, proofExtractedData };
            } else if (existing || !tenantSees(collection, record, access.apartmentNumber)) {
                // repairTickets: tenants report new ones; status and budgets are for owners and craftsmen.
                return res.status(403).json({ error: NO_ACCESS });
            }
        }

        await pool.query(
            `insert into building_records (building_id, collection, id, data) values ($1, $2, $3, $4)
       on duplicate key update data = values(data), updated_at = current_timestamp(3)`,
            [access.buildingId, collection, record.id, record]
        );
        res.json({ ok: true });
    })
);

// ---------- site admin ----------

dbRouter.use('/api/admin', (req: AuthedRequest, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: NO_ACCESS })));

dbRouter.get(
    '/api/admin',
    h(async (_req, res) => {
        const { rows: users } = await pool.query(
            `select u.id, u.email, JSON_UNQUOTE(JSON_EXTRACT(u.profile, '$.name')) as name, JSON_UNQUOTE(JSON_EXTRACT(u.profile, '$.role')) as role, u.created_at as createdAt,
              (select count(*)::int from memberships m where m.email = u.email) as buildings
         from users u order by u.created_at desc`
        );
        const { rows: buildings } = await pool.query(
            `select b.id, JSON_UNQUOTE(JSON_EXTRACT(b.data, '$.name')) as name, JSON_UNQUOTE(JSON_EXTRACT(b.data, '$.city')) as city,
              (select group_concat(m.email separator ', ') from memberships m where m.building_id = b.id and m.role = 'owner') as owners,
              (select count(*)::int from memberships m where m.building_id = b.id) as members,
              (select count(*)::int from building_records r where r.building_id = b.id) - 1 as records
         from building_records b where b.collection = 'buildings' order by b.seq desc`
        );
        res.json({ users, buildings });
    })
);

dbRouter.delete(
    '/api/admin/users/:id',
    h(async (req, res) => {
        if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Не можеш да изтриеш себе си.' });
        // Sessions go with the user (on delete cascade); memberships are keyed by email.
        const { rows: found } = await pool.query('select email from users where id = $1', [req.params.id]);
        if (found[0]) { await pool.query('delete from users where id = $1', [req.params.id]); await pool.query('delete from memberships where email = $1', [found[0].email]); }
        res.json({ ok: true });
    })
);

dbRouter.delete(
    '/api/admin/buildings/:id',
    h(async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('begin');
            await client.query('delete from building_records where building_id = $1', [req.params.id]);
            await client.query('delete from memberships where building_id = $1', [req.params.id]);
            await client.query('update sessions set active_building_id = null where active_building_id = $1', [req.params.id]);
            await client.query('commit');
        } catch (err) {
            await client.query('rollback');
            throw err;
        } finally {
            client.release();
        }
        res.json({ ok: true });
    })
);

// Owners can delete any record in their building. Deleting an expense puts its amount back in the reserve fund.
dbRouter.delete(
    '/api/data/:collection/:id',
    h(async (req, res) => {
        const collection = req.params.collection;
        if (!COLLECTIONS[collection] || collection === 'buildings') return res.status(404).json({ error: 'Непознат вид данни.' });
        const access = await membership(req);
        if (access?.role !== 'owner') return res.status(403).json({ error: NO_ACCESS });
        const client = await pool.connect();
        let updatedBuilding: any = null;
        try {
            await client.query('begin');
            const { rows: deleted } = await client.query('select data from building_records where building_id = $1 and collection = $2 and id = $3 for update', [access.buildingId, collection, req.params.id]);
            await client.query('delete from building_records where building_id = $1 and collection = $2 and id = $3', [access.buildingId, collection, req.params.id]);
            if (collection === 'expenses' && deleted[0]) {
                const { rows: buildings } = await client.query("select data from building_records where building_id = $1 and collection = 'buildings' and id = $1 for update", [access.buildingId]);
                if (buildings[0]) { const b = buildings[0].data; b.reserveFundBalance = Number(b.reserveFundBalance || 0) + Number(deleted[0].data.amount || 0); await client.query("update building_records set data = $1 where building_id = $2 and collection = 'buildings' and id = $2", [b, access.buildingId]); updatedBuilding = b; }
            }
            await client.query('commit');
        } catch (err) { await client.query('rollback'); throw err; } finally { client.release(); }
        res.json({ ok: true, building: updatedBuilding });
    })
);

// Deletes a whole building with everything in it and every membership. Owner only.
dbRouter.delete(
    '/api/buildings/:id',
    h(async (req, res) => {
        const { rows } = await pool.query(`select 1 from memberships where building_id = $1 and email = $2 and role = 'owner'`, [req.params.id, req.email]);
        if (!rows[0]) return res.status(403).json({ error: NO_ACCESS });
        const client = await pool.connect();
        try {
            await client.query('begin');
            await client.query('delete from building_records where building_id = $1', [req.params.id]);
            await client.query('delete from memberships where building_id = $1', [req.params.id]);
            await client.query('update sessions set active_building_id = null where active_building_id = $1', [req.params.id]);
            await client.query('commit');
        } catch (err) {
            await client.query('rollback');
            throw err;
        } finally {
            client.release();
        }
        res.json({ ok: true });
    })
);

dbRouter.post(
    '/api/expenses',
    h(async (req, res) => {
        const exp = req.body;
        const amount = Number(exp?.amount);
        if (!exp || typeof exp.id !== 'string' || !Number.isFinite(amount)) {
            return res.status(400).json({ error: 'Невалиден разход.' });
        }
        const access = await membership(req);
        if (!access || ACCESS[access.role].expenses !== 'write') return res.status(403).json({ error: NO_ACCESS });
        exp.buildingId = access.buildingId;
        // One statement keeps the expense and the reserve-fund update atomic.
        const client = await pool.connect();
        let building: any;
        try {
            await client.query('begin');
            await client.query("insert into building_records (building_id, collection, id, data) values ($1, 'expenses', $2, $3)", [access.buildingId, exp.id, exp]);
            const { rows } = await client.query("select data from building_records where building_id = $1 and collection = 'buildings' and id = $1 for update", [access.buildingId]);
            if (!rows[0]) throw new Error('Building not found');
            building = rows[0].data; building.reserveFundBalance = Number(building.reserveFundBalance || 0) - amount;
            await client.query("update building_records set data = $1 where building_id = $2 and collection = 'buildings' and id = $2", [building, access.buildingId]);
            await client.query('commit');
        } catch (err) { await client.query('rollback'); throw err; } finally { client.release(); }
        res.json({ building });
    })
);

dbRouter.post(
    '/api/buildings',
    h(async (req, res) => {
        if (req.user!.role !== 'owner' && !isAdmin(req)) return res.status(403).json({ error: 'Само собственици могат да създават сгради.' });
        const b = req.body || {};
        const name = str(b.name);
        const address = str(b.address);
        const city = str(b.city);
        if (!name || !address || !city) return res.status(400).json({ error: 'Попълни име, адрес и град.' });
        const building: Building = {
            id: `bld-${crypto.randomUUID()}`,
            name,
            address,
            city,
            postalCode: str(b.postalCode),
            totalFloors: int(b.totalFloors, 1, 100),
            totalApartments: int(b.totalApartments, 0, 5000),
            occupiedApartments: 0,
            yearBuilt: int(b.yearBuilt, 1800, 2100),
            reserveFundBalance: Number(b.reserveFundBalance) || 0,
            monthlyCollectionRate: 0,
            exteriorImage: '',
            lobbyImage: '',
            facilities: [],
            contactManager: req.user!.name,
            phoneManager: req.user!.phone,
            iban: str(b.iban).toUpperCase() || undefined,
            bankName: str(b.bankName) || undefined,
        };
        const client = await pool.connect();
        try {
            await client.query('begin');
            await client.query(`insert into building_records (building_id, collection, id, data) values ($1, 'buildings', $1, $2)`, [building.id, building]);
            await client.query(`insert into memberships (building_id, email, role) values ($1, $2, 'owner')`, [building.id, req.email]);
            await client.query('update sessions set active_building_id = $1 where token_hash = $2', [building.id, req.tokenHash]);
            await client.query('commit');
        } catch (err) {
            await client.query('rollback');
            throw err;
        } finally {
            client.release();
        }
        res.json({ building });
    })
);

dbRouter.post(
    '/api/active-building',
    h(async (req, res) => {
        const buildingId = str(req.body?.buildingId);
        const { rowCount } = await pool.query(
            `update sessions set active_building_id = $1
        where token_hash = $2 and exists (select 1 from memberships where building_id = $1 and email = $3)`,
            [buildingId, req.tokenHash, req.email]
        );
        if (!rowCount) return res.status(403).json({ error: NO_ACCESS });
        res.json({ ok: true });
    })
);

dbRouter.post(
    '/api/members',
    h(async (req, res) => {
        const access = await membership(req);
        if (access?.role !== 'owner') return res.status(403).json({ error: NO_ACCESS });
        const email = str(req.body?.email).toLowerCase();
        const role = req.body?.role;
        const apartmentNumber = str(req.body?.apartmentNumber) || null;
        if (!email.includes('@')) return res.status(400).json({ error: 'Тоя имейл не изглежда наред.' });
        // Only the creator owns a building; other owners never get rights to it.
        if (!ROLES.includes(role) || role === 'owner') return res.status(400).json({ error: 'Невалидна роля.' });
        if (role === 'tenant' && !apartmentNumber) return res.status(400).json({ error: 'Наемателят трябва да има апартамент.' });
        if (email === req.email) return res.status(400).json({ error: 'Не можеш да смениш собствената си роля.' });
        await pool.query(
            `insert into memberships (building_id, email, role, apartment_number) values ($1, $2, $3, $4)
       on duplicate key update role = values(role), apartment_number = values(apartment_number)`,
            [access.buildingId, email, role, apartmentNumber]
        );
        const { rows } = await pool.query(`select JSON_UNQUOTE(JSON_EXTRACT(data, '$.name')) as name from building_records where building_id = $1 and collection = 'buildings' and id = $1`, [access.buildingId]);
        await sendMail(
            email,
            `Добавен си в „${rows[0]?.name}“ в Building Brain`,
            `Здравей!\n\n${req.user!.name} те добави в сградата „${rows[0]?.name}“ в Building Brain.\nВлез или си направи профил с този имейл: ${appUrl(req)}\n`
        ).catch((err) => console.error('Invite mail failed:', err));
        res.json({ ok: true });
    })
);

dbRouter.delete(
    '/api/members/:email',
    h(async (req, res) => {
        const access = await membership(req);
        if (access?.role !== 'owner') return res.status(403).json({ error: NO_ACCESS });
        const email = req.params.email.toLowerCase();
        if (email === req.email) return res.status(400).json({ error: 'Не можеш да премахнеш себе си.' });
        await pool.query('delete from memberships where building_id = $1 and email = $2', [access.buildingId, email]);
        res.json({ ok: true });
    })
);

dbRouter.post(
    '/api/reset',
    h(async (req, res) => {
        const access = await membership(req);
        if (access?.role !== 'owner') return res.status(403).json({ error: 'Само собственикът може да направи това.' });
        // Demo buildings go back to their seed; a user-made building keeps its own record and loses the rest.
        const seed = seedRows(access.buildingId);
        const client = await pool.connect();
        try {
            await client.query('begin');
            await client.query(
                `delete from building_records where building_id = $1 ${seed.length ? '' : "and collection <> 'buildings'"}`,
                [access.buildingId]
            );
            if (seed.length) await insertSeed(client, seed);
            await client.query('commit');
        } catch (err) {
            await client.query('rollback');
            throw err;
        } finally {
            client.release();
        }
        res.json({ ok: true });
    })
);
