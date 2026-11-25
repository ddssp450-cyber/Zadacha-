import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ADMIN_EMAIL,
  DbUser,
  buildIdentifierTokens,
  buildLookupHashes,
  buildQueryTokensFromSingleInput,
  createSession,
  db,
  getSessionUser,
  hashPassword,
  isUserAdmin,
  makeId,
  parseJsonSafe,
  revokeSession,
  toPublicUser,
  uniqueStrings,
  verifyPassword,
  withTransaction,
} from './db.ts';

type UserRole = 'owner' | 'tenant' | 'builder' | 'craftsman';

const ALLOWED_SUBCOLS = new Set([
  'apartments',
  'payments',
  'appliances',
  'repairTickets',
  'defects',
  'calendarEvents',
  'expenses',
]);

const SUBCOLS_BY_ROLE: Record<'tenant' | 'builder' | 'craftsman', string[]> = {
  tenant: ['apartments', 'payments', 'appliances', 'repairTickets', 'calendarEvents'],
  builder: ['apartments', 'appliances', 'repairTickets', 'defects', 'calendarEvents'],
  craftsman: ['apartments', 'appliances', 'repairTickets', 'calendarEvents'],
};

interface AuthedRequest extends Request {
  user?: DbUser;
  authToken?: string;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function extractAuthToken(req: Request): { token: string | null; viaCookie: boolean } {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) {
    return { token: match[1].trim(), viaCookie: false };
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.bb_session) {
    return { token: cookies.bb_session, viaCookie: true };
  }
  return { token: null, viaCookie: false };
}

function isSameOriginMutation(req: Request): boolean {
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    return Boolean(expectedHost && originHost === expectedHost);
  } catch {
    return false;
  }
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const isHttps = proto.includes('https') || req.secure;
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const maxAge = 30 * 24 * 60 * 60;
  if (isHttps || isLocalhost) {
    res.setHeader(
      'Set-Cookie',
      `bb_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAge}`
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `bb_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
    );
  }
}

function clearSessionCookie(req: Request, res: Response) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').toLowerCase();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const isHttps = proto.includes('https') || req.secure;
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (isHttps || isLocalhost) {
    res.setHeader(
      'Set-Cookie',
      'bb_session=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0'
    );
  } else {
    res.setHeader('Set-Cookie', 'bb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const { token, viaCookie } = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Нужен е вход с профил.' });
  }
  if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase()) && !isSameOriginMutation(req)) {
    return res.status(403).json({ error: 'Невалиден произход на заявката.' });
  }
  const user = getSessionUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Сесията е изтекла. Влез отново.' });
  }
  req.user = user;
  req.authToken = token;
  return next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || !isUserAdmin(req.user)) {
    return res.status(403).json({ error: 'Само администратор има достъп до тази секция.' });
  }
  return next();
}

interface BuildingRow {
  id: string;
  owner_id: string;
  owner_email: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  total_floors: number;
  total_apartments: number;
  occupied_apartments: number;
  year_built: number;
  reserve_fund_balance: number;
  monthly_collection_rate: number;
  exterior_image: string;
  lobby_image: string;
  facilities_json: string;
  contact_manager: string;
  phone_manager: string;
  iban: string;
  bank_name: string;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  building_id: string;
  user_id: string;
  role: UserRole;
  apartment_number: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  invite_id: string | null;
  joined_at: string;
}

interface InviteRow {
  id: string;
  building_id: string;
  building_name: string;
  owner_id: string;
  email: string;
  phone: string | null;
  name: string | null;
  role: 'tenant' | 'builder' | 'craftsman';
  apartment_number: string | null;
  lookup_hashes_json: string;
  claimed_uids_json: string;
  created_at: string;
}

function formatBuilding(row: BuildingRow) {
  const members = db
    .prepare('SELECT user_id FROM building_members WHERE building_id = ?')
    .all(row.id) as Array<{ user_id: string }>;
  const invites = db
    .prepare('SELECT email FROM building_invites WHERE building_id = ?')
    .all(row.id) as Array<{ email: string }>;

  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    memberUids: uniqueStrings([row.owner_id, ...members.map((m) => m.user_id)]),
    invitedEmails: uniqueStrings(invites.map((i) => i.email.toLowerCase())),
    name: row.name,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    totalFloors: row.total_floors,
    totalApartments: row.total_apartments,
    occupiedApartments: row.occupied_apartments,
    yearBuilt: row.year_built,
    reserveFundBalance: row.reserve_fund_balance,
    monthlyCollectionRate: row.monthly_collection_rate,
    exteriorImage: row.exterior_image,
    lobbyImage: row.lobby_image,
    facilities: parseJsonSafe<string[]>(row.facilities_json, []),
    contactManager: row.contact_manager,
    phoneManager: row.phone_manager,
    iban: row.iban,
    bankName: row.bank_name,
  };
}

function getMembership(buildingId: string, userId: string): MemberRow | undefined {
  return db
    .prepare('SELECT * FROM building_members WHERE building_id = ? AND user_id = ?')
    .get(buildingId, userId) as unknown as MemberRow | undefined;
}

function getCallerBuildingAccess(buildingId: string, user: DbUser): {
  building: BuildingRow;
  role: UserRole;
  apartmentNumber?: string;
} | null {
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId) as unknown as BuildingRow | undefined;
  if (!building) return null;

  if (building.owner_id === user.id || isUserAdmin(user)) {
    return { building, role: 'owner' };
  }

  const member = getMembership(buildingId, user.id);
  if (!member) return null;

  return {
    building,
    role: member.role,
    apartmentNumber: member.apartment_number || undefined,
  };
}

function memberAllowedOnDoc(
  subcol: string,
  role: UserRole,
  apartmentNumber: string | undefined,
  docData: Record<string, any>
): boolean {
  if (role === 'owner') return true;
  switch (subcol) {
    case 'apartments':
      if (role === 'builder' || role === 'craftsman') return true;
      return role === 'tenant' && Boolean(apartmentNumber) && docData.number === apartmentNumber;
    case 'payments':
      return role === 'tenant' && Boolean(apartmentNumber) && docData.apartmentNumber === apartmentNumber;
    case 'appliances':
      return true;
    case 'repairTickets':
      if (role === 'builder' || role === 'craftsman') return true;
      return (
        role === 'tenant' &&
        (!docData.apartmentNumber || docData.apartmentNumber === '' || docData.apartmentNumber === apartmentNumber)
      );
    case 'defects':
      return role === 'builder';
    case 'calendarEvents':
      if (role === 'builder' || role === 'craftsman') return true;
      return (
        role === 'tenant' &&
        (docData.assignedRole === 'all' ||
          docData.assignedRole === 'tenant' ||
          (Boolean(apartmentNumber) && docData.apartmentNumber === apartmentNumber))
      );
    case 'expenses':
      return false;
    default:
      return false;
  }
}

function claimInvitesMatchingHashes(user: DbUser, hashes: string[]): string[] {
  if (hashes.length === 0) return [];
  const hashSet = new Set(hashes);
  const allInvites = db.prepare('SELECT * FROM building_invites').all() as unknown as InviteRow[];
  const claimedBuildingIds: string[] = [];
  const now = new Date().toISOString();

  for (const inv of allInvites) {
    const invHashes = parseJsonSafe<string[]>(inv.lookup_hashes_json, []);
    const matchedByHash = invHashes.some((h) => hashSet.has(h));
    const matchedByEmail =
      !user.is_anonymous &&
      user.email_lower &&
      inv.email &&
      inv.email.toLowerCase() === user.email_lower;

    if (!matchedByHash && !matchedByEmail) continue;

    const existingMember = getMembership(inv.building_id, user.id);
    if (!existingMember) {
      db.prepare(
        `INSERT INTO building_members (id, building_id, user_id, role, apartment_number, name, email, phone, invite_id, joined_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `${inv.building_id}_${user.id}`,
        inv.building_id,
        user.id,
        inv.role,
        inv.apartment_number || null,
        user.name || inv.name || null,
        user.is_anonymous ? inv.email : user.email,
        user.phone || inv.phone || null,
        inv.id,
        now
      );
    }

    const claimedUids = uniqueStrings([...parseJsonSafe<string[]>(inv.claimed_uids_json, []), user.id]);
    db.prepare('UPDATE building_invites SET claimed_uids_json = ? WHERE id = ?').run(
      JSON.stringify(claimedUids),
      inv.id
    );

    if (inv.role === 'tenant' && inv.apartment_number) {
      const aptRows = db
        .prepare('SELECT id, data_json FROM building_records WHERE building_id = ? AND subcol = ?')
        .all(inv.building_id, 'apartments') as Array<{ id: string; data_json: string }>;
      for (const aptRow of aptRows) {
        const apt = parseJsonSafe<Record<string, any>>(aptRow.data_json, {});
        if (apt.number === inv.apartment_number) {
          apt.tenantId = user.id;
          if (!apt.tenantName && (user.name || inv.name)) {
            apt.tenantName = user.name || inv.name;
          }
          db.prepare('UPDATE building_records SET data_json = ?, updated_at = ? WHERE id = ?').run(
            JSON.stringify(apt),
            now,
            aptRow.id
          );
        }
      }
    }

    claimedBuildingIds.push(inv.building_id);
  }

  const uniqueIds = uniqueStrings(claimedBuildingIds);
  if (uniqueIds.length > 0 && !user.active_building_id) {
    db.prepare('UPDATE users SET active_building_id = ?, updated_at = ? WHERE id = ?').run(
      uniqueIds[0],
      now,
      user.id
    );
    user.active_building_id = uniqueIds[0];
  }
  return uniqueIds;
}

function sanitizeSubdocRecord(
  subcol: string,
  record: Record<string, any>,
  buildingId: string
): Record<string, any> {
  switch (subcol) {
    case 'apartments':
      return {
        id: String(record.id || makeId('apt')),
        buildingId,
        number: String(record.number || '1').slice(0, 32),
        floor: Math.round(Number(record.floor) || 1),
        entrance: record.entrance !== undefined ? String(record.entrance).slice(0, 32) : undefined,
        areaSqM: Number(record.areaSqM) || 0,
        rooms: Math.round(Number(record.rooms) || 1),
        tenantId: record.tenantId !== undefined ? String(record.tenantId).slice(0, 128) : undefined,
        tenantName: record.tenantName !== undefined ? String(record.tenantName).slice(0, 120) : undefined,
        tenantPhone: record.tenantPhone !== undefined ? String(record.tenantPhone).slice(0, 40) : undefined,
        status: record.status || 'vacant',
        monthlyRent: Number(record.monthlyRent) || 0,
        monthlyMaintenanceFee: Number(record.monthlyMaintenanceFee) || 0,
        waterMeterReading: Number(record.waterMeterReading) || 0,
        electricMeterReading: Number(record.electricMeterReading) || 0,
        lastMeterUpdate: String(record.lastMeterUpdate || '').slice(0, 32),
      };
    case 'payments':
      return {
        id: String(record.id || makeId('pay')),
        buildingId,
        apartmentId: String(record.apartmentId || '').slice(0, 128),
        apartmentNumber: String(record.apartmentNumber || '').slice(0, 32),
        tenantId: String(record.tenantId || '').slice(0, 128),
        tenantName: String(record.tenantName || '').slice(0, 120),
        title: String(record.title || 'Задължение').slice(0, 200),
        type: record.type || 'rent',
        amount: Number(record.amount) || 0,
        dueDate: String(record.dueDate || '').slice(0, 32),
        period: String(record.period || '').slice(0, 64),
        status: record.status || 'unpaid',
        paidAmount: record.paidAmount !== undefined ? Number(record.paidAmount) || 0 : undefined,
        paidAt: record.paidAt !== undefined ? String(record.paidAt).slice(0, 64) : undefined,
        proofUrl: record.proofUrl !== undefined ? String(record.proofUrl).slice(0, 1000000) : undefined,
        proofType: record.proofType,
        proofExtractedData: record.proofExtractedData,
        confirmedByOwnerAt: record.confirmedByOwnerAt !== undefined ? String(record.confirmedByOwnerAt).slice(0, 64) : undefined,
        rejectedReason: record.rejectedReason !== undefined ? String(record.rejectedReason).slice(0, 500) : undefined,
        notes: record.notes !== undefined ? String(record.notes).slice(0, 1000) : undefined,
      };
    case 'appliances':
      return {
        id: String(record.id || makeId('app')),
        buildingId,
        apartmentId: record.apartmentId !== undefined ? String(record.apartmentId).slice(0, 128) : undefined,
        locationName: String(record.locationName || '').slice(0, 160),
        name: String(record.name || 'Уред').slice(0, 160),
        category: record.category || 'hvac',
        model: String(record.model || '').slice(0, 160),
        manufacturer: String(record.manufacturer || '').slice(0, 120),
        serialNumber: String(record.serialNumber || '').slice(0, 120),
        installationDate: String(record.installationDate || '').slice(0, 32),
        warrantyExpiryDate: String(record.warrantyExpiryDate || '').slice(0, 32),
        status: record.status || 'operational',
        lastServicedAt: String(record.lastServicedAt || '').slice(0, 32),
        nextMaintenanceDue: String(record.nextMaintenanceDue || '').slice(0, 32),
        photoUrl: String(record.photoUrl || '').slice(0, 1000000),
        manualUrl: record.manualUrl !== undefined ? String(record.manualUrl).slice(0, 1024) : undefined,
        energyClass: record.energyClass !== undefined ? String(record.energyClass).slice(0, 32) : undefined,
        serviceHistory: Array.isArray(record.serviceHistory) ? record.serviceHistory.slice(0, 100) : [],
      };
    case 'repairTickets':
      return {
        id: String(record.id || makeId('rep')),
        buildingId,
        ticketNumber: String(record.ticketNumber || 'REM-1').slice(0, 64),
        title: String(record.title || 'Ремонт').slice(0, 200),
        description: String(record.description || '').slice(0, 4000),
        category: record.category || 'plumbing',
        priority: record.priority || 'medium',
        status: record.status || 'reported',
        apartmentId: record.apartmentId !== undefined ? String(record.apartmentId).slice(0, 128) : undefined,
        apartmentNumber: record.apartmentNumber !== undefined ? String(record.apartmentNumber).slice(0, 32) : undefined,
        reporterRole: record.reporterRole || 'owner',
        reporterName: String(record.reporterName || 'Потребител').slice(0, 120),
        assignedCraftsmanId: record.assignedCraftsmanId !== undefined ? String(record.assignedCraftsmanId).slice(0, 128) : undefined,
        assignedCraftsmanName: record.assignedCraftsmanName !== undefined ? String(record.assignedCraftsmanName).slice(0, 120) : undefined,
        assignedBuilderName: record.assignedBuilderName !== undefined ? String(record.assignedBuilderName).slice(0, 120) : undefined,
        estimatedBudget: Number(record.estimatedBudget) || 0,
        approvedBudget: record.approvedBudget !== undefined ? Number(record.approvedBudget) || 0 : undefined,
        actualCost: record.actualCost !== undefined ? Number(record.actualCost) || 0 : undefined,
        reportedDate: String(record.reportedDate || '').slice(0, 32),
        deadlineDate: String(record.deadlineDate || '').slice(0, 32),
        scheduledVisitDate: record.scheduledVisitDate !== undefined ? String(record.scheduledVisitDate).slice(0, 32) : undefined,
        completedDate: record.completedDate !== undefined ? String(record.completedDate).slice(0, 32) : undefined,
        locationDetail: String(record.locationDetail || '').slice(0, 240),
        beforePhotos: Array.isArray(record.beforePhotos) ? record.beforePhotos.slice(0, 10) : [],
        afterPhotos: Array.isArray(record.afterPhotos) ? record.afterPhotos.slice(0, 10) : [],
        materialsUsed: Array.isArray(record.materialsUsed) ? record.materialsUsed.slice(0, 30) : undefined,
        technicianNotes: record.technicianNotes !== undefined ? String(record.technicianNotes).slice(0, 2000) : undefined,
        ownerApprovalNotes: record.ownerApprovalNotes !== undefined ? String(record.ownerApprovalNotes).slice(0, 2000) : undefined,
      };
    case 'defects':
      return {
        id: String(record.id || makeId('def')),
        buildingId,
        defectNumber: String(record.defectNumber || 'DEF-1').slice(0, 64),
        title: String(record.title || 'Дефект').slice(0, 200),
        location: String(record.location || '').slice(0, 240),
        severity: record.severity || 'cosmetic',
        status: record.status || 'open',
        reportedBy: String(record.reportedBy || 'Потребител').slice(0, 120),
        reportedAt: String(record.reportedAt || '').slice(0, 32),
        deadline: String(record.deadline || '').slice(0, 32),
        contractorName: String(record.contractorName || '').slice(0, 160),
        photos: Array.isArray(record.photos) ? record.photos.slice(0, 10) : [],
        actionPlan: String(record.actionPlan || '').slice(0, 2000),
        verifiedAt: record.verifiedAt !== undefined ? String(record.verifiedAt).slice(0, 64) : undefined,
      };
    case 'calendarEvents':
      return {
        id: String(record.id || makeId('evt')),
        buildingId,
        title: String(record.title || 'Събитие').slice(0, 200),
        category: record.category || 'inspection',
        startDateTime: String(record.startDateTime || new Date().toISOString().slice(0, 16)).slice(0, 64),
        endDateTime: String(record.endDateTime || new Date().toISOString().slice(0, 16)).slice(0, 64),
        apartmentNumber: record.apartmentNumber !== undefined ? String(record.apartmentNumber).slice(0, 32) : undefined,
        assignedToName: String(record.assignedToName || '').slice(0, 120),
        assignedRole: record.assignedRole || 'all',
        status: record.status || 'pending',
        description: String(record.description || '').slice(0, 2000),
        priority: record.priority || 'normal',
        isRecurring: record.isRecurring !== undefined ? Boolean(record.isRecurring) : undefined,
        recurrenceRule: record.recurrenceRule !== undefined ? String(record.recurrenceRule).slice(0, 120) : undefined,
      };
    case 'expenses':
      return {
        id: String(record.id || makeId('exp')),
        buildingId,
        title: String(record.title || 'Разход').slice(0, 200),
        category: record.category || 'repair',
        amount: Math.max(0, Number(record.amount) || 0),
        date: String(record.date || '').slice(0, 32),
        vendor: String(record.vendor || '').slice(0, 160),
        invoiceNumber: String(record.invoiceNumber || '').slice(0, 80),
        status: record.status || 'paid',
        approvedByOwner: Boolean(record.approvedByOwner),
        documentUrl: record.documentUrl !== undefined ? String(record.documentUrl).slice(0, 1000000) : undefined,
      };
    default:
      return record;
  }
}

export const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ================= AUTH =================
apiRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  return res.json({ user: toPublicUser(user) });
});

apiRouter.post('/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().slice(0, 180);
  const emailLower = email.toLowerCase();
  const phone = String(req.body?.phone || '').trim().slice(0, 40);
  const password = String(req.body?.password || '');

  if (!name) return res.status(400).json({ error: 'Въведи име и фамилия.' });
  if (!emailLower || !emailLower.includes('@')) {
    return res.status(400).json({ error: 'Въведи валиден имейл адрес.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Паролата трябва да е поне 6 символа.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email_lower = ?').get(emailLower);
  if (existing) {
    return res.status(409).json({
      error: 'Вече има регистриран профил с този имейл. Използвай „Вход“.',
    });
  }

  const now = new Date().toISOString();
  const userId = makeId('usr');
  const passwordHash = hashPassword(password);
  const roleTitle = emailLower === ADMIN_EMAIL ? 'Администратор' : 'Собственик';

  const user: DbUser = withTransaction(() => {
    db.prepare(
      `INSERT INTO users (id, name, email, email_lower, phone, password_hash, is_anonymous, role_title, avatar_url, active_building_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, '', NULL, ?, ?)`
    ).run(userId, name, email, emailLower, phone, passwordHash, roleTitle, now, now);

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
    const hashes = buildLookupHashes(buildIdentifierTokens({ email: emailLower, phone }));
    claimInvitesMatchingHashes(created, hashes);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
  });

  const token = createSession(user.id);
  setSessionCookie(req, res, token);
  return res.status(201).json({ user: toPublicUser(user), token });
});

apiRouter.post('/auth/login', (req, res) => {
  const emailLower = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!emailLower || !password) {
    return res.status(400).json({ error: 'Въведи имейл и парола.' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email_lower = ? AND is_anonymous = 0')
    .get(emailLower) as unknown as DbUser | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Грешен имейл или парола.' });
  }

  withTransaction(() => {
    const hashes = buildLookupHashes(buildIdentifierTokens({ email: user.email, phone: user.phone }));
    claimInvitesMatchingHashes(user, hashes);
  });

  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as unknown as DbUser;
  const token = createSession(freshUser.id);
  setSessionCookie(req, res, token);
  return res.json({ user: toPublicUser(freshUser), token });
});

apiRouter.post('/auth/tenant-login', (req, res) => {
  const identifier = String(req.body?.identifier || '').trim();
  if (!identifier) {
    return res.status(400).json({
      error: 'Въведи имейл, телефонен номер или името, под което те е записал собственикът.',
    });
  }

  const queryHashes = buildLookupHashes(buildQueryTokensFromSingleInput(identifier));
  if (queryHashes.length === 0) {
    return res.status(400).json({
      error: 'Въведи валиден телефон (поне 6 цифри), име или имейл.',
    });
  }

  const hashSet = new Set(queryHashes);
  const allInvites = db.prepare('SELECT * FROM building_invites').all() as unknown as InviteRow[];
  const matchedInvites = allInvites.filter((inv) => {
    const invHashes = parseJsonSafe<string[]>(inv.lookup_hashes_json, []);
    return invHashes.some((h) => hashSet.has(h));
  });

  if (matchedInvites.length === 0) {
    return res.status(404).json({
      error: `Не намерихме покана за „${identifier}“. Попитай собственика по какви данни (име, телефон или имейл) те е добавил в сградата.`,
    });
  }

  const user = withTransaction(() => {
    let existingTenant: DbUser | undefined;
    for (const inv of matchedInvites) {
      const uids = parseJsonSafe<string[]>(inv.claimed_uids_json, []);
      for (const uid of uids) {
        const candidate = db
          .prepare('SELECT * FROM users WHERE id = ? AND is_anonymous = 1')
          .get(uid) as unknown as DbUser | undefined;
        if (candidate) {
          existingTenant = candidate;
          break;
        }
      }
      if (existingTenant) break;
    }

    const now = new Date().toISOString();
    let targetUser: DbUser;
    if (existingTenant) {
      targetUser = existingTenant;
    } else {
      const firstInvite = matchedInvites[0];
      const userId = makeId('ten');
      const displayName = (firstInvite.name || (!identifier.includes('@') ? identifier : 'Наемател')).slice(0, 120);
      const phone = (firstInvite.phone || (/^\+?[0-9\s-]{6,}$/.test(identifier) ? identifier : '')).slice(0, 40);
      db.prepare(
        `INSERT INTO users (id, name, email, email_lower, phone, password_hash, is_anonymous, role_title, avatar_url, active_building_id, created_at, updated_at)
         VALUES (?, ?, '', '', ?, NULL, 1, 'Наемател', '', ?, ?, ?)`
      ).run(userId, displayName, phone, firstInvite.building_id, now, now);
      targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as DbUser;
    }

    claimInvitesMatchingHashes(targetUser, queryHashes);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(targetUser.id) as unknown as DbUser;
  });

  const token = createSession(user.id);
  setSessionCookie(req, res, token);
  return res.json({ user: toPublicUser(user), token });
});

apiRouter.post('/auth/logout', (req, res) => {
  const { token, viaCookie } = extractAuthToken(req);
  if (viaCookie && !isSameOriginMutation(req)) {
    return res.status(403).json({ error: 'Невалиден произход на заявката.' });
  }
  revokeSession(token);
  clearSessionCookie(req, res);
  return res.json({ ok: true });
});

// ================= BUILDINGS & INVITES =================
apiRouter.get('/buildings', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  let rows: BuildingRow[];
  if (isUserAdmin(user)) {
    rows = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC').all() as unknown as BuildingRow[];
  } else {
    rows = db
      .prepare(
        `SELECT DISTINCT b.*
         FROM buildings b
         LEFT JOIN building_members m ON m.building_id = b.id AND m.user_id = ?
         WHERE b.owner_id = ? OR m.user_id = ?
         ORDER BY b.created_at DESC`
      )
      .all(user.id, user.id, user.id) as unknown as BuildingRow[];
  }
  return res.json({ buildings: rows.map(formatBuilding) });
});

apiRouter.post('/buildings', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  if (user.is_anonymous) {
    return res.status(403).json({ error: 'Само регистрирани собственици могат да създават сгради.' });
  }

  const name = String(req.body?.name || '').trim().slice(0, 160);
  const address = String(req.body?.address || '').trim().slice(0, 240);
  const city = String(req.body?.city || '').trim().slice(0, 100);
  if (!name || !address || !city) {
    return res.status(400).json({ error: 'Попълни име, град и адрес на сградата.' });
  }

  const buildingId = makeId('bld');
  const now = new Date().toISOString();

  const created = withTransaction(() => {
    db.prepare(
      `INSERT INTO buildings (
        id, owner_id, owner_email, name, address, city, postal_code,
        total_floors, total_apartments, occupied_apartments, year_built,
        reserve_fund_balance, monthly_collection_rate, exterior_image, lobby_image,
        facilities_json, contact_manager, phone_manager, iban, bank_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, '', '', '[]', ?, ?, ?, ?, ?, ?)`
    ).run(
      buildingId,
      user.id,
      user.email,
      name,
      address,
      city,
      String(req.body?.postalCode || '').slice(0, 20),
      Math.max(1, Math.min(200, Math.round(Number(req.body?.totalFloors) || 1))),
      Math.max(0, Math.min(5000, Math.round(Number(req.body?.totalApartments) || 0))),
      Math.max(1800, Math.min(2100, Math.round(Number(req.body?.yearBuilt) || new Date().getFullYear()))),
      String(req.body?.contactManager || user.name || '').slice(0, 120),
      String(req.body?.phoneManager || user.phone || '').slice(0, 40),
      String(req.body?.iban || '').slice(0, 64),
      String(req.body?.bankName || '').slice(0, 120),
      now,
      now
    );

    db.prepare(
      `INSERT INTO building_members (id, building_id, user_id, role, apartment_number, name, email, phone, invite_id, joined_at)
       VALUES (?, ?, ?, 'owner', NULL, ?, ?, ?, NULL, ?)`
    ).run(`${buildingId}_${user.id}`, buildingId, user.id, user.name, user.email, user.phone || null, now);

    db.prepare('UPDATE users SET active_building_id = ?, updated_at = ? WHERE id = ?').run(
      buildingId,
      now,
      user.id
    );

    return db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId) as unknown as BuildingRow;
  });

  return res.status(201).json({ building: formatBuilding(created) });
});

apiRouter.patch('/buildings/:id', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as unknown as BuildingRow | undefined;
  if (!building) return res.status(404).json({ error: 'Сградата не е намерена.' });
  if (building.owner_id !== user.id && !isUserAdmin(user)) {
    return res.status(403).json({ error: 'Само собственикът може да редактира сградата.' });
  }

  const p = req.body || {};
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE buildings SET
      name = ?, address = ?, city = ?, postal_code = ?,
      total_floors = ?, total_apartments = ?, year_built = ?,
      reserve_fund_balance = ?, contact_manager = ?, phone_manager = ?,
      iban = ?, bank_name = ?, exterior_image = ?, lobby_image = ?,
      facilities_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    p.name !== undefined ? String(p.name).slice(0, 160) : building.name,
    p.address !== undefined ? String(p.address).slice(0, 240) : building.address,
    p.city !== undefined ? String(p.city).slice(0, 100) : building.city,
    p.postalCode !== undefined ? String(p.postalCode).slice(0, 20) : building.postal_code,
    p.totalFloors !== undefined ? Math.max(1, Math.min(200, Math.round(Number(p.totalFloors) || 1))) : building.total_floors,
    p.totalApartments !== undefined ? Math.max(0, Math.min(5000, Math.round(Number(p.totalApartments) || 0))) : building.total_apartments,
    p.yearBuilt !== undefined ? Math.max(1800, Math.min(2100, Math.round(Number(p.yearBuilt) || new Date().getFullYear()))) : building.year_built,
    p.reserveFundBalance !== undefined ? Number(p.reserveFundBalance) || 0 : building.reserve_fund_balance,
    p.contactManager !== undefined ? String(p.contactManager).slice(0, 120) : building.contact_manager,
    p.phoneManager !== undefined ? String(p.phoneManager).slice(0, 40) : building.phone_manager,
    p.iban !== undefined ? String(p.iban).slice(0, 64) : building.iban,
    p.bankName !== undefined ? String(p.bankName).slice(0, 120) : building.bank_name,
    p.exteriorImage !== undefined ? String(p.exteriorImage).slice(0, 1000000) : building.exterior_image,
    p.lobbyImage !== undefined ? String(p.lobbyImage).slice(0, 1000000) : building.lobby_image,
    p.facilities !== undefined ? JSON.stringify(Array.isArray(p.facilities) ? p.facilities.slice(0, 30) : []) : building.facilities_json,
    now,
    building.id
  );

  const updated = db.prepare('SELECT * FROM buildings WHERE id = ?').get(building.id) as unknown as BuildingRow;
  return res.json({ building: formatBuilding(updated) });
});

apiRouter.delete('/buildings/:id', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as unknown as BuildingRow | undefined;
  if (!building) return res.status(404).json({ error: 'Сградата не е намерена.' });
  if (building.owner_id !== user.id && !isUserAdmin(user)) {
    return res.status(403).json({ error: 'Само собственикът или администратор може да изтрие сградата.' });
  }

  db.prepare('DELETE FROM buildings WHERE id = ?').run(building.id);
  return res.json({ ok: true });
});

apiRouter.post('/buildings/:id/active', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const access = getCallerBuildingAccess(req.params.id, user);
  if (!access) return res.status(403).json({ error: 'Нямаш достъп до тази сграда.' });

  db.prepare('UPDATE users SET active_building_id = ?, updated_at = ? WHERE id = ?').run(
    req.params.id,
    new Date().toISOString(),
    user.id
  );
  return res.json({ ok: true });
});

apiRouter.post('/invites/claim', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';

  const hashes = identifier
    ? buildLookupHashes(buildQueryTokensFromSingleInput(identifier))
    : buildLookupHashes(buildIdentifierTokens({ email: user.email, phone: user.phone }));

  const claimedBuildingIds = withTransaction(() => claimInvitesMatchingHashes(user, hashes));
  return res.json({ claimedBuildingIds });
});

apiRouter.get('/buildings/:id/data', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const access = getCallerBuildingAccess(req.params.id, user);
  if (!access) {
    return res.status(403).json({ error: 'Нямаш достъп до тази сграда.' });
  }

  const { role, apartmentNumber } = access;
  const isOwner = role === 'owner';

  const memberRows = isOwner
    ? (db.prepare('SELECT * FROM building_members WHERE building_id = ?').all(req.params.id) as unknown as MemberRow[])
    : (db
        .prepare('SELECT * FROM building_members WHERE building_id = ? AND user_id = ?')
        .all(req.params.id, user.id) as unknown as MemberRow[]);

  const inviteRows = isOwner
    ? (db.prepare('SELECT * FROM building_invites WHERE building_id = ?').all(req.params.id) as unknown as InviteRow[])
    : [];

  const members = memberRows.map((m) => ({
    uid: m.user_id,
    inviteId: m.invite_id || undefined,
    ownerId: access.building.owner_id,
    buildingId: m.building_id,
    role: m.role,
    apartmentNumber: m.apartment_number || undefined,
    name: m.name,
    email: m.email,
    phone: m.phone,
  }));

  const invites = inviteRows.map((inv) => ({
    id: inv.id,
    buildingId: inv.building_id,
    buildingName: inv.building_name,
    ownerId: inv.owner_id,
    email: inv.email,
    phone: inv.phone || undefined,
    name: inv.name || undefined,
    role: inv.role,
    apartmentNumber: inv.apartment_number || undefined,
    lookupHashes: parseJsonSafe<string[]>(inv.lookup_hashes_json, []),
    claimedUids: parseJsonSafe<string[]>(inv.claimed_uids_json, []),
  }));

  const allowedSubcols = isOwner ? Array.from(ALLOWED_SUBCOLS) : SUBCOLS_BY_ROLE[role as 'tenant' | 'builder' | 'craftsman'] || [];

  const grouped: Record<string, any[]> = {
    apartments: [],
    payments: [],
    appliances: [],
    repairTickets: [],
    defects: [],
    calendarEvents: [],
    expenses: [],
  };

  const rows = db
    .prepare('SELECT subcol, data_json FROM building_records WHERE building_id = ?')
    .all(req.params.id) as Array<{ subcol: string; data_json: string }>;

  for (const r of rows) {
    if (!allowedSubcols.includes(r.subcol)) continue;
    const item = parseJsonSafe<Record<string, any> | null>(r.data_json, null);
    if (!item) continue;
    if (isOwner || memberAllowedOnDoc(r.subcol, role, apartmentNumber, item)) {
      grouped[r.subcol].push(item);
    }
  }

  grouped.apartments.sort((a, b) => Number(a.number) - Number(b.number));

  return res.json({
    building: formatBuilding(access.building),
    members,
    invites,
    ...grouped,
  });
});

// ================= MEMBERS & INVITES =================
apiRouter.post('/buildings/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as unknown as BuildingRow | undefined;
  if (!building) return res.status(404).json({ error: 'Сградата не е намерена.' });
  if (building.owner_id !== user.id && !isUserAdmin(user)) {
    return res.status(403).json({ error: 'Само собственикът може да добавя участници.' });
  }

  const name = String(req.body?.name || '').trim().slice(0, 120);
  const phone = String(req.body?.phone || '').trim().slice(0, 40);
  const emailLower = String(req.body?.email || '').trim().toLowerCase().slice(0, 180);
  const role = String(req.body?.role || 'tenant') as 'tenant' | 'builder' | 'craftsman';
  const apartmentNumber = String(req.body?.apartmentNumber || '').trim().slice(0, 32);

  if (!['tenant', 'builder', 'craftsman'].includes(role)) {
    return res.status(400).json({ error: 'Невалидна роля.' });
  }
  if (!name && !phone && !emailLower) {
    return res.status(400).json({ error: 'Въведи поне име, телефон или имейл на участника.' });
  }
  if (emailLower && !emailLower.includes('@')) {
    return res.status(400).json({ error: 'Въведи валиден имейл адрес или остави полето празно.' });
  }
  if (role === 'tenant' && !apartmentNumber) {
    return res.status(400).json({ error: 'Посочи номер на апартамент за наемателя.' });
  }

  const lookupHashes = buildLookupHashes(buildIdentifierTokens({ email: emailLower, phone, name }));
  const inviteId = makeId('inv');
  const now = new Date().toISOString();

  withTransaction(() => {
    const claimedUids: string[] = [];

    if (emailLower) {
      const existingUser = db
        .prepare('SELECT * FROM users WHERE email_lower = ? AND is_anonymous = 0')
        .get(emailLower) as unknown as DbUser | undefined;
      if (existingUser) {
        claimedUids.push(existingUser.id);
        const existingMem = getMembership(building.id, existingUser.id);
        if (!existingMem) {
          db.prepare(
            `INSERT INTO building_members (id, building_id, user_id, role, apartment_number, name, email, phone, invite_id, joined_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            `${building.id}_${existingUser.id}`,
            building.id,
            existingUser.id,
            role,
            role === 'tenant' ? apartmentNumber : null,
            name || existingUser.name || null,
            existingUser.email,
            phone || existingUser.phone || null,
            inviteId,
            now
          );
        }
      }
    }

    db.prepare(
      `INSERT INTO building_invites (
        id, building_id, building_name, owner_id, email, phone, name, role,
        apartment_number, lookup_hashes_json, claimed_uids_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      inviteId,
      building.id,
      building.name,
      building.owner_id,
      emailLower,
      phone || null,
      name || null,
      role,
      role === 'tenant' ? apartmentNumber : null,
      JSON.stringify(lookupHashes),
      JSON.stringify(claimedUids),
      now
    );

    if (role === 'tenant' && apartmentNumber) {
      const aptRows = db
        .prepare('SELECT id, data_json FROM building_records WHERE building_id = ? AND subcol = ?')
        .all(building.id, 'apartments') as Array<{ id: string; data_json: string }>;
      for (const aptRow of aptRows) {
        const apt = parseJsonSafe<Record<string, any>>(aptRow.data_json, {});
        if (apt.number === apartmentNumber) {
          if (name) apt.tenantName = name;
          if (phone) apt.tenantPhone = phone;
          if (claimedUids[0]) apt.tenantId = claimedUids[0];
          apt.status = 'occupied';
          db.prepare('UPDATE building_records SET data_json = ?, updated_at = ? WHERE id = ?').run(
            JSON.stringify(apt),
            now,
            aptRow.id
          );
        }
      }
    }
  });

  return res.status(201).json({ ok: true, inviteId });
});

apiRouter.delete('/buildings/:id/members', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as unknown as BuildingRow | undefined;
  if (!building) return res.status(404).json({ error: 'Сградата не е намерена.' });
  if (building.owner_id !== user.id && !isUserAdmin(user)) {
    return res.status(403).json({ error: 'Само собственикът може да премахва участници.' });
  }

  const uidsToRemove = uniqueStrings([
    typeof req.body?.uid === 'string' ? req.body.uid : '',
    ...(Array.isArray(req.body?.uids) ? req.body.uids : []),
  ]).filter((u) => u !== building.owner_id);
  const inviteId = typeof req.body?.inviteId === 'string' ? req.body.inviteId : '';
  const emailLower = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  withTransaction(() => {
    for (const uid of uidsToRemove) {
      db.prepare('DELETE FROM building_members WHERE building_id = ? AND user_id = ?').run(building.id, uid);
    }
    if (inviteId) {
      db.prepare('DELETE FROM building_invites WHERE building_id = ? AND id = ?').run(building.id, inviteId);
      db.prepare('DELETE FROM building_members WHERE building_id = ? AND invite_id = ?').run(building.id, inviteId);
    } else if (emailLower) {
      db.prepare('DELETE FROM building_invites WHERE building_id = ? AND LOWER(email) = ?').run(building.id, emailLower);
    }
  });

  return res.json({ ok: true });
});

// ================= SUBCOLLECTION RECORDS =================
apiRouter.post('/buildings/:id/records/:subcol', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const subcol = req.params.subcol;
  if (!ALLOWED_SUBCOLS.has(subcol)) {
    return res.status(400).json({ error: 'Невалидна колекция.' });
  }

  const access = getCallerBuildingAccess(req.params.id, user);
  if (!access) return res.status(403).json({ error: 'Нямаш достъп до тази сграда.' });

  const { building, role, apartmentNumber } = access;
  const isOwner = role === 'owner';

  if (!isOwner) {
    const allowedCreate =
      (role === 'tenant' && subcol === 'repairTickets') ||
      (role === 'builder' && (subcol === 'defects' || subcol === 'repairTickets' || subcol === 'calendarEvents')) ||
      (role === 'craftsman' && (subcol === 'repairTickets' || subcol === 'calendarEvents'));
    if (!allowedCreate) {
      return res.status(403).json({ error: 'Нямаш права за създаване на този запис.' });
    }
  }

  const sanitized = sanitizeSubdocRecord(subcol, req.body || {}, building.id);
  if (role === 'tenant' && subcol === 'repairTickets') {
    sanitized.reporterRole = 'tenant';
    if (apartmentNumber && !sanitized.apartmentNumber) {
      sanitized.apartmentNumber = apartmentNumber;
    }
  }

  const now = new Date().toISOString();
  withTransaction(() => {
    db.prepare(
      `INSERT INTO building_records (id, building_id, subcol, created_by_uid, apartment_number, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sanitized.id,
      building.id,
      subcol,
      user.id,
      sanitized.apartmentNumber || sanitized.number || null,
      JSON.stringify(sanitized),
      now,
      now
    );

    if (subcol === 'expenses' && sanitized.status === 'paid' && Number(sanitized.amount) > 0) {
      db.prepare('UPDATE buildings SET reserve_fund_balance = reserve_fund_balance - ?, updated_at = ? WHERE id = ?').run(
        Number(sanitized.amount),
        now,
        building.id
      );
    }
  });

  return res.status(201).json({ record: sanitized });
});

apiRouter.patch('/buildings/:id/records/:subcol/:recordId', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const subcol = req.params.subcol;
  if (!ALLOWED_SUBCOLS.has(subcol)) {
    return res.status(400).json({ error: 'Невалидна колекция.' });
  }

  const access = getCallerBuildingAccess(req.params.id, user);
  if (!access) return res.status(403).json({ error: 'Нямаш достъп до тази сграда.' });

  const row = db
    .prepare('SELECT * FROM building_records WHERE id = ? AND building_id = ? AND subcol = ?')
    .get(req.params.recordId, req.params.id, subcol) as { id: string; data_json: string } | undefined;

  if (!row) return res.status(404).json({ error: 'Записът не е намерен.' });

  const existing = parseJsonSafe<Record<string, any>>(row.data_json, {});
  const { role, apartmentNumber } = access;
  const isOwner = role === 'owner';

  const patch = (req.body?.patch && typeof req.body.patch === 'object' ? req.body.patch : req.body) || {};
  const allowedPatch: Record<string, any> = {};

  if (isOwner) {
    Object.assign(allowedPatch, patch);
  } else if (role === 'tenant') {
    if (subcol === 'payments' && existing.apartmentNumber === apartmentNumber) {
      const tenantPaymentFields = ['status', 'paidAmount', 'paidAt', 'proofUrl', 'proofType', 'proofExtractedData', 'notes', 'rejectedReason'];
      for (const k of tenantPaymentFields) {
        if (patch[k] !== undefined) allowedPatch[k] = patch[k];
      }
      if (allowedPatch.status !== undefined && !['declared_paid', 'pending_verification'].includes(allowedPatch.status)) {
        return res.status(403).json({ error: 'Само собственикът може да потвърждава окончателно плащания.' });
      }
    } else if (subcol === 'apartments' && existing.number === apartmentNumber) {
      for (const k of ['waterMeterReading', 'electricMeterReading', 'lastMeterUpdate']) {
        if (patch[k] !== undefined) allowedPatch[k] = patch[k];
      }
    } else if (subcol === 'repairTickets' && (!existing.apartmentNumber || existing.apartmentNumber === apartmentNumber)) {
      for (const k of ['description', 'beforePhotos', 'status']) {
        if (patch[k] !== undefined) allowedPatch[k] = patch[k];
      }
    } else {
      return res.status(403).json({ error: 'Нямаш права за редакция на този запис.' });
    }
  } else if (role === 'builder') {
    if (subcol === 'defects' || subcol === 'repairTickets' || subcol === 'calendarEvents') {
      Object.assign(allowedPatch, patch);
    } else {
      return res.status(403).json({ error: 'Нямаш права за редакция на този запис.' });
    }
  } else if (role === 'craftsman') {
    if (subcol === 'repairTickets' || subcol === 'appliances' || subcol === 'calendarEvents') {
      Object.assign(allowedPatch, patch);
    } else {
      return res.status(403).json({ error: 'Нямаш права за редакция на този запис.' });
    }
  }

  delete allowedPatch.id;
  delete allowedPatch.buildingId;

  const merged = sanitizeSubdocRecord(subcol, { ...existing, ...allowedPatch, id: existing.id }, req.params.id);
  const now = new Date().toISOString();
  const reserveIncrement = isOwner && subcol === 'payments' ? Number(req.body?.reserveIncrement) || 0 : 0;

  withTransaction(() => {
    db.prepare('UPDATE building_records SET data_json = ?, apartment_number = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(merged),
      merged.apartmentNumber || merged.number || null,
      now,
      row.id
    );

    if (reserveIncrement > 0 && existing.status !== 'confirmed_paid' && merged.status === 'confirmed_paid' && merged.type === 'repair_fund') {
      db.prepare('UPDATE buildings SET reserve_fund_balance = reserve_fund_balance + ?, updated_at = ? WHERE id = ?').run(
        reserveIncrement,
        now,
        req.params.id
      );
    }
  });

  return res.json({ record: merged });
});

apiRouter.delete('/buildings/:id/records/:subcol/:recordId', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const subcol = req.params.subcol;
  if (!ALLOWED_SUBCOLS.has(subcol)) {
    return res.status(400).json({ error: 'Невалидна колекция.' });
  }

  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id) as unknown as BuildingRow | undefined;
  if (!building) return res.status(404).json({ error: 'Сградата не е намерена.' });
  if (building.owner_id !== user.id && !isUserAdmin(user)) {
    return res.status(403).json({ error: 'Само собственикът може да изтрива записи.' });
  }

  const row = db
    .prepare('SELECT * FROM building_records WHERE id = ? AND building_id = ? AND subcol = ?')
    .get(req.params.recordId, req.params.id, subcol) as { id: string; data_json: string } | undefined;

  if (!row) return res.status(404).json({ error: 'Записът не е намерен.' });

  const existing = parseJsonSafe<Record<string, any>>(row.data_json, {});
  const now = new Date().toISOString();

  withTransaction(() => {
    db.prepare('DELETE FROM building_records WHERE id = ?').run(row.id);
    if (subcol === 'expenses' && existing.status === 'paid' && Number(existing.amount) > 0) {
      db.prepare('UPDATE buildings SET reserve_fund_balance = reserve_fund_balance + ?, updated_at = ? WHERE id = ?').run(
        Number(existing.amount),
        now,
        building.id
      );
    }
  });

  return res.json({ ok: true });
});

// ================= ADMIN =================
apiRouter.get('/admin/overview', requireAuth, requireAdmin, (_req, res) => {
  const userRows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as unknown as DbUser[];
  const buildingRows = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC').all() as unknown as BuildingRow[];

  const memberRows = db
    .prepare('SELECT building_id, user_id, email, role FROM building_members')
    .all() as Array<{ building_id: string; user_id: string; email: string; role: string }>;

  const recordCounts = db
    .prepare('SELECT building_id, COUNT(*) as cnt FROM building_records GROUP BY building_id')
    .all() as Array<{ building_id: string; cnt: number }>;

  const countMap = new Map(recordCounts.map((r) => [r.building_id, Number(r.cnt)]));

  const users = userRows.map((u) => {
    const userBuildingCount = new Set(
      [
        ...buildingRows.filter((b) => b.owner_id === u.id).map((b) => b.id),
        ...memberRows.filter((m) => m.user_id === u.id).map((m) => m.building_id),
      ]
    ).size;
    return {
      id: u.id,
      name: u.name || '—',
      email: u.email || (u.is_anonymous ? 'Наемател (без имейл)' : '—'),
      role: isUserAdmin(u) ? 'admin' : u.is_anonymous ? 'tenant' : 'owner',
      buildings: userBuildingCount,
      createdAt: u.created_at,
    };
  });

  const buildings = buildingRows.map((b) => {
    const members = memberRows.filter((m) => m.building_id === b.id);
    const owners = members.filter((m) => m.role === 'owner').map((m) => m.email).filter(Boolean);
    return {
      id: b.id,
      name: b.name,
      city: b.city,
      owners: uniqueStrings([b.owner_email, ...owners]).join(', '),
      members: Math.max(1, members.length),
      records: countMap.get(b.id) || 0,
    };
  });

  return res.json({ users, buildings });
});

apiRouter.delete('/admin/users/:userId', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  if (req.params.userId === req.user!.id) {
    return res.status(400).json({ error: 'Не можеш да изтриеш собствения си администраторски профил.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.userId);
  return res.json({ ok: true });
});

apiRouter.delete('/admin/buildings/:buildingId', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.buildingId);
  return res.json({ ok: true });
});
