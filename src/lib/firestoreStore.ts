import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Unsubscribe,
} from 'firebase/firestore';
import { signInAnonymously, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, db, ADMIN_EMAIL, OperationType, handleFirestoreError } from './firebase';
import {
  UserProfile,
  UserRole,
  Building,
  Apartment,
  PaymentObligation,
  Appliance,
  RepairTicket,
  ConstructionDefect,
  CalendarEvent,
  ExpenseRecord,
} from '../types';
import type { BuildingFields, Member } from '../components/BuildingAdmin';

export interface BuildingMeta extends Building {
  ownerId: string;
  ownerEmail: string;
  memberUids: string[];
  invitedEmails: string[];
}

export interface InviteRecord {
  id: string;
  buildingId: string;
  buildingName: string;
  ownerId: string;
  email: string;
  phone?: string;
  name?: string;
  role: 'tenant' | 'builder' | 'craftsman';
  apartmentNumber?: string;
  lookupHashes?: string[];
  claimedUids?: string[];
  authorizedDocs?: Record<string, string[]>;
}

export interface MemberRecord extends Member {
  uid?: string;
  inviteId?: string;
  ownerId?: string;
  buildingId?: string;
  phone?: string | null;
}

interface UserDocData {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  companyName?: string;
  avatarUrl: string;
  activeBuildingId?: string;
}

const SUBCOLS_BY_ROLE: Record<'tenant' | 'builder' | 'craftsman', string[]> = {
  tenant: ['apartments', 'payments', 'appliances', 'repairTickets', 'calendarEvents'],
  builder: ['apartments', 'appliances', 'repairTickets', 'defects', 'calendarEvents'],
  craftsman: ['apartments', 'appliances', 'repairTickets', 'calendarEvents'],
};

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now()}-${rand}`;
}

function uniqueStrings(items: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      set.add(item.trim());
    }
  }
  return Array.from(set);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function buildLookupHashes(tokens: string[]): Promise<string[]> {
  if (tokens.length === 0) return [];
  const hashes = await Promise.all(tokens.map((t) => sha256Hex(t)));
  return uniqueStrings(hashes).slice(0, 20);
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

function buildAclForDoc(
  subcol: string,
  ownerId: string,
  members: MemberRecord[],
  invites: InviteRecord[],
  docData: Record<string, any>
): { memberUids: string[]; invitedEmails: string[] } {
  const uids: string[] = [ownerId];
  const emails: string[] = [];

  for (const m of members) {
    if (!m.uid) continue;
    if (memberAllowedOnDoc(subcol, m.role, m.apartmentNumber ?? undefined, docData)) {
      uids.push(m.uid);
    }
  }

  for (const inv of invites) {
    if (memberAllowedOnDoc(subcol, inv.role, inv.apartmentNumber, docData)) {
      if (inv.email && inv.email.includes('@')) {
        emails.push(inv.email.toLowerCase());
      }
      if (Array.isArray(inv.claimedUids)) {
        for (const cUid of inv.claimedUids) {
          uids.push(cUid);
        }
      }
    }
  }

  return {
    memberUids: uniqueStrings(uids).slice(0, 50),
    invitedEmails: uniqueStrings(emails).slice(0, 50),
  };
}

function sanitizeBuildingPayload(b: BuildingMeta) {
  return stripUndefined({
    id: b.id,
    ownerId: b.ownerId,
    ownerEmail: b.ownerEmail,
    memberUids: uniqueStrings([b.ownerId, ...(b.memberUids || [])]).slice(0, 50),
    invitedEmails: uniqueStrings((b.invitedEmails || []).map((e) => e.toLowerCase())).slice(0, 50),
    name: String(b.name || 'Сграда').slice(0, 160),
    address: String(b.address || '—').slice(0, 240),
    city: String(b.city || 'София').slice(0, 100),
    postalCode: String(b.postalCode || '').slice(0, 20),
    totalFloors: Math.max(1, Math.min(200, Math.round(Number(b.totalFloors) || 1))),
    totalApartments: Math.max(0, Math.min(5000, Math.round(Number(b.totalApartments) || 0))),
    occupiedApartments: Math.max(0, Math.min(5000, Math.round(Number(b.occupiedApartments) || 0))),
    yearBuilt: Math.max(1800, Math.min(2100, Math.round(Number(b.yearBuilt) || new Date().getFullYear()))),
    reserveFundBalance: Number(b.reserveFundBalance) || 0,
    monthlyCollectionRate: Number(b.monthlyCollectionRate) || 0,
    exteriorImage: String(b.exteriorImage || '').slice(0, 500000),
    lobbyImage: String(b.lobbyImage || '').slice(0, 500000),
    facilities: Array.isArray(b.facilities) ? b.facilities.slice(0, 30).map((f) => String(f).slice(0, 200)) : [],
    contactManager: String(b.contactManager || '').slice(0, 120),
    phoneManager: String(b.phoneManager || '').slice(0, 40),
    iban: b.iban !== undefined ? String(b.iban).slice(0, 64) : undefined,
    bankName: b.bankName !== undefined ? String(b.bankName).slice(0, 120) : undefined,
    updatedAt: serverTimestamp(),
  });
}

function sanitizeSubdocPayload(
  subcol: string,
  record: Record<string, any>,
  building: BuildingMeta,
  members: MemberRecord[],
  invites: InviteRecord[],
  currentUid: string
): Record<string, any> {
  const acl = buildAclForDoc(subcol, building.ownerId, members, invites, record);
  const base = {
    buildingId: building.id,
    ownerId: building.ownerId,
    updatedAt: serverTimestamp(),
  };

  switch (subcol) {
    case 'apartments':
      return stripUndefined({
        ...base,
        memberUids: acl.memberUids,
        invitedEmails: acl.invitedEmails,
        id: record.id,
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
      });

    case 'payments':
      return stripUndefined({
        ...base,
        memberUids: acl.memberUids,
        invitedEmails: acl.invitedEmails,
        id: record.id,
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
        proofUrl: record.proofUrl !== undefined ? String(record.proofUrl).slice(0, 600000) : undefined,
        proofType: record.proofType,
        proofExtractedData: record.proofExtractedData,
        confirmedByOwnerAt: record.confirmedByOwnerAt !== undefined ? String(record.confirmedByOwnerAt).slice(0, 64) : undefined,
        rejectedReason: record.rejectedReason !== undefined ? String(record.rejectedReason).slice(0, 500) : undefined,
        notes: record.notes !== undefined ? String(record.notes).slice(0, 1000) : undefined,
      });

    case 'appliances':
      return stripUndefined({
        ...base,
        memberUids: acl.memberUids,
        invitedEmails: acl.invitedEmails,
        id: record.id,
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
        photoUrl: String(record.photoUrl || '').slice(0, 500000),
        manualUrl: record.manualUrl !== undefined ? String(record.manualUrl).slice(0, 1024) : undefined,
        energyClass: record.energyClass !== undefined ? String(record.energyClass).slice(0, 32) : undefined,
        serviceHistory: Array.isArray(record.serviceHistory) ? record.serviceHistory.slice(0, 100) : [],
      });

    case 'repairTickets':
      return stripUndefined({
        ...base,
        createdByUid: record.createdByUid || currentUid,
        memberUids: acl.memberUids,
        invitedEmails: acl.invitedEmails,
        id: record.id,
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
      });

    case 'defects':
      return stripUndefined({
        ...base,
        memberUids: acl.memberUids,
        invitedEmails: acl.invitedEmails,
        id: record.id,
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
      });

    case 'calendarEvents':
      return stripUndefined({
        ...base,
        memberUids: acl.memberUids,
        invitedEmails: acl.invitedEmails,
        id: record.id,
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
      });

    case 'expenses':
      return stripUndefined({
        ...base,
        memberUids: [building.ownerId],
        id: record.id,
        title: String(record.title || 'Разход').slice(0, 200),
        category: record.category || 'repair',
        amount: Math.max(0, Number(record.amount) || 0),
        date: String(record.date || '').slice(0, 32),
        vendor: String(record.vendor || '').slice(0, 160),
        invoiceNumber: String(record.invoiceNumber || '').slice(0, 80),
        status: record.status || 'paid',
        approvedByOwner: Boolean(record.approvedByOwner),
        documentUrl: record.documentUrl !== undefined ? String(record.documentUrl).slice(0, 600000) : undefined,
      });

    default:
      return stripUndefined({ ...base, ...record });
  }
}

export async function ensureUserDoc(
  fbUser: FirebaseUser,
  overrides?: { name?: string; phone?: string }
): Promise<UserDocData> {
  const path = `users/${fbUser.uid}`;
  const ref = doc(db, 'users', fbUser.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as UserDocData;
      const patch: Record<string, any> = {};
      if (overrides?.name?.trim() && (!existing.name || existing.name === 'Потребител' || existing.name === 'Наемател')) {
        patch.name = overrides.name.trim().slice(0, 120);
      }
      if (overrides?.phone?.trim() && !existing.phone) {
        patch.phone = overrides.phone.trim().slice(0, 40);
      }
      if (Object.keys(patch).length > 0) {
        await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
        return { ...existing, ...patch };
      }
      return existing;
    }

    const fallbackName = fbUser.isAnonymous ? 'Наемател' : 'Потребител';
    const payload = stripUndefined({
      id: fbUser.uid,
      uid: fbUser.uid,
      name: (overrides?.name?.trim() || fbUser.displayName || fbUser.email || fallbackName).slice(0, 120),
      email: fbUser.isAnonymous ? '' : (fbUser.email || ''),
      phone: (overrides?.phone?.trim() || '').slice(0, 40),
      roleTitle:
        !fbUser.isAnonymous && fbUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
          ? 'Администратор'
          : fbUser.isAnonymous
            ? 'Наемател'
            : 'Потребител',
      avatarUrl: (fbUser.photoURL || '').slice(0, 1024),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
    return {
      id: payload.id,
      uid: payload.uid,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      roleTitle: payload.roleTitle,
      avatarUrl: payload.avatarUrl,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateActiveBuilding(uid: string, buildingId: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      activeBuildingId: buildingId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function claimInviteRecord(
  inv: InviteRecord,
  fbUser: FirebaseUser,
  displayNameFallback?: string
): Promise<string | null> {
  const uid = fbUser.uid;
  const buildingRef = doc(db, 'buildings', inv.buildingId);
  let bSnap;
  try {
    bSnap = await getDoc(buildingRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `buildings/${inv.buildingId}`);
  }

  if (!bSnap.exists()) {
    return null;
  }

  const bData = bSnap.data() as BuildingMeta;
  const memberRef = doc(db, 'buildings', inv.buildingId, 'members', uid);
  let mSnap;
  try {
    mSnap = await getDoc(memberRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `buildings/${inv.buildingId}/members/${uid}`);
  }

  // Step 1: Atomically create member doc + add uid to building.memberUids
  try {
    const batch1 = writeBatch(db);
    let hasOps1 = false;
    if (!mSnap.exists()) {
      const resolvedEmail = fbUser.isAnonymous
        ? ''
        : (fbUser.email || inv.email || '').toLowerCase();
      const resolvedName = (
        fbUser.displayName ||
        inv.name ||
        displayNameFallback ||
        fbUser.email ||
        inv.phone ||
        'Участник'
      ).slice(0, 120);

      batch1.set(
        memberRef,
        stripUndefined({
          uid,
          buildingId: inv.buildingId,
          ownerId: inv.ownerId,
          email: resolvedEmail,
          phone: inv.phone ? String(inv.phone).slice(0, 40) : undefined,
          name: resolvedName,
          role: inv.role,
          apartmentNumber: inv.apartmentNumber ? String(inv.apartmentNumber).slice(0, 32) : undefined,
          inviteId: inv.id,
          createdAt: serverTimestamp(),
        })
      );
      hasOps1 = true;
    }
    if (!bData.memberUids?.includes(uid)) {
      batch1.update(buildingRef, {
        memberUids: arrayUnion(uid),
        updatedAt: serverTimestamp(),
      });
      hasOps1 = true;
    }
    if (hasOps1) {
      await batch1.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `buildings/${inv.buildingId}`);
  }

  // Step 2: Join role-authorized subcollection docs and record claimedUid on the invite
  try {
    const targetRefsMap = new Map<string, ReturnType<typeof doc>>();
    const allowedSubcols = SUBCOLS_BY_ROLE[inv.role] || [];

    // 2a. Direct gets using invite.authorizedDocs (works for anonymous phone/name tenants too)
    if (inv.authorizedDocs && typeof inv.authorizedDocs === 'object') {
      for (const subcol of allowedSubcols) {
        const ids = Array.isArray(inv.authorizedDocs[subcol]) ? inv.authorizedDocs[subcol] : [];
        for (const docId of ids) {
          if (!docId) continue;
          try {
            const subRef = doc(db, 'buildings', inv.buildingId, subcol, docId);
            const sSnap = await getDoc(subRef);
            if (sSnap.exists()) {
              const sData = sSnap.data();
              if (
                (!Array.isArray(sData.memberUids) || !sData.memberUids.includes(uid)) &&
                memberAllowedOnDoc(subcol, inv.role, inv.apartmentNumber, sData)
              ) {
                targetRefsMap.set(subRef.path, subRef);
              }
            }
          } catch {
            // Skip inaccessible docs
          }
        }
      }
    }

    // 2b. For verified-email accounts, also catch any subdocs matching invitedEmails
    if (fbUser.email && fbUser.emailVerified && !fbUser.isAnonymous) {
      const emailLower = fbUser.email.trim().toLowerCase();
      for (const subcol of allowedSubcols) {
        const subSnap = await getDocs(
          query(
            collection(db, 'buildings', inv.buildingId, subcol),
            where('invitedEmails', 'array-contains', emailLower)
          )
        );
        for (const d of subSnap.docs) {
          const data = d.data();
          if (!Array.isArray(data.memberUids) || !data.memberUids.includes(uid)) {
            targetRefsMap.set(d.ref.path, d.ref);
          }
        }
      }
    }

    const targetRefs = Array.from(targetRefsMap.values());
    const invRef = doc(db, 'invites', inv.id);
    const alreadyClaimed = Array.isArray(inv.claimedUids) && inv.claimedUids.includes(uid);

    const batches = chunk(targetRefs, 400);
    if (batches.length === 0) {
      if (!alreadyClaimed) {
        await updateDoc(invRef, {
          claimedUids: arrayUnion(uid),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      for (let i = 0; i < batches.length; i++) {
        const b = writeBatch(db);
        for (const ref of batches[i]) {
          b.update(ref, { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() });
        }
        if (i === batches.length - 1 && !alreadyClaimed) {
          b.update(invRef, { claimedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
        }
        await b.commit();
      }
    }
    return inv.buildingId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `buildings/${inv.buildingId}`);
  }
}

export async function claimPendingInvites(fbUser: FirebaseUser): Promise<string | null> {
  if (!fbUser.email || !fbUser.emailVerified || fbUser.isAnonymous) return null;
  const emailLower = fbUser.email.trim().toLowerCase();
  let claimedBuildingId: string | null = null;

  let inviteSnap;
  try {
    inviteSnap = await getDocs(query(collection(db, 'invites'), where('email', '==', emailLower)));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'invites');
  }

  for (const invDoc of inviteSnap.docs) {
    const inv = invDoc.data() as InviteRecord;
    const bid = await claimInviteRecord(inv, fbUser);
    if (bid) claimedBuildingId = bid;
  }

  return claimedBuildingId;
}

export async function claimInvitesByIdentifier(
  fbUser: FirebaseUser,
  identifier: string
): Promise<{ claimedBuildingIds: string[]; matchedInvites: InviteRecord[] }> {
  const tokens = buildQueryTokensFromSingleInput(identifier);
  const hashes = await buildLookupHashes(tokens);
  if (hashes.length === 0) {
    return { claimedBuildingIds: [], matchedInvites: [] };
  }

  const inviteIdsSet = new Set<string>();
  const lookupSnaps = await Promise.all(
    hashes.map((h) => getDoc(doc(db, 'inviteLookups', h)).catch(() => null))
  );
  for (const snap of lookupSnaps) {
    if (snap && snap.exists()) {
      const ids = snap.data().inviteIds;
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === 'string' && id) inviteIdsSet.add(id);
        }
      }
    }
  }

  const inviteIds = Array.from(inviteIdsSet);
  if (inviteIds.length === 0) {
    return { claimedBuildingIds: [], matchedInvites: [] };
  }

  // Write tenantClaims proof so Firestore rules verify this user knows the matching identifier hash
  try {
    await setDoc(doc(db, 'tenantClaims', fbUser.uid), {
      uid: fbUser.uid,
      claimHashes: hashes,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `tenantClaims/${fbUser.uid}`);
  }

  const matchedInvites: InviteRecord[] = [];
  for (const invId of inviteIds) {
    try {
      const invSnap = await getDoc(doc(db, 'invites', invId));
      if (invSnap.exists()) {
        matchedInvites.push(invSnap.data() as InviteRecord);
      }
    } catch {
      // Stale or unauthorized invite ID
    }
  }

  const claimedBuildingIds: string[] = [];
  for (const inv of matchedInvites) {
    const bid = await claimInviteRecord(inv, fbUser, identifier.trim());
    if (bid && !claimedBuildingIds.includes(bid)) {
      claimedBuildingIds.push(bid);
    }
  }

  if (claimedBuildingIds.length > 0) {
    const firstInv = matchedInvites[0];
    const patch: Record<string, any> = {
      activeBuildingId: claimedBuildingIds[0],
      updatedAt: serverTimestamp(),
    };
    if (firstInv?.name && firstInv.name.trim()) {
      patch.name = firstInv.name.trim().slice(0, 120);
    }
    if (firstInv?.phone && firstInv.phone.trim()) {
      patch.phone = firstInv.phone.trim().slice(0, 40);
    }
    await updateDoc(doc(db, 'users', fbUser.uid), patch).catch(() => {});
  }

  return { claimedBuildingIds, matchedInvites };
}

export async function loginAndClaimAsTenant(identifier: string): Promise<{
  user: FirebaseUser;
  claimedBuildingIds: string[];
}> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error('Въведи имейл, телефон или име, под което си записан от собственика.');
  }

  const cred = await signInAnonymously(auth);
  const fbUser = cred.user;

  const looksLikePhone = /^\+?[\d\s\-()]{6,}$/.test(trimmed);
  await ensureUserDoc(fbUser, {
    name: !trimmed.includes('@') && !looksLikePhone ? trimmed : 'Наемател',
    phone: looksLikePhone ? trimmed : '',
  });

  const { claimedBuildingIds } = await claimInvitesByIdentifier(fbUser, trimmed);
  if (claimedBuildingIds.length === 0) {
    await signOut(auth).catch(() => {});
    throw new Error(
      'Не намерихме сграда, в която да сте добавен с тези данни. Проверете имейла, телефона или името, подадени на собственика.'
    );
  }

  return { user: fbUser, claimedBuildingIds };
}

export async function createBuildingInFirestore(
  fbUser: FirebaseUser,
  fields: BuildingFields
): Promise<string> {
  const buildingId = makeId('bld');
  const uid = fbUser.uid;
  const email = fbUser.email || '';

  const buildingDoc = sanitizeBuildingPayload({
    id: buildingId,
    ownerId: uid,
    ownerEmail: email,
    memberUids: [uid],
    invitedEmails: [],
    name: fields.name,
    address: fields.address,
    city: fields.city,
    postalCode: fields.postalCode,
    totalFloors: fields.totalFloors,
    totalApartments: fields.totalApartments,
    occupiedApartments: 0,
    yearBuilt: fields.yearBuilt,
    reserveFundBalance: 0,
    monthlyCollectionRate: 0,
    exteriorImage: '',
    lobbyImage: '',
    facilities: [],
    contactManager: fields.contactManager || fbUser.displayName || email,
    phoneManager: fields.phoneManager || '',
    iban: fields.iban || undefined,
    bankName: fields.bankName || undefined,
  });

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'buildings', buildingId), {
      ...buildingDoc,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'buildings', buildingId, 'members', uid), {
      uid,
      buildingId,
      ownerId: uid,
      email: email.toLowerCase(),
      name: (fbUser.displayName || email || 'Собственик').slice(0, 120),
      role: 'owner',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'users', uid), {
      activeBuildingId: buildingId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return buildingId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `buildings/${buildingId}`);
  }
}

export async function updateBuildingDetails(
  building: BuildingMeta,
  fields: Partial<BuildingFields> & Partial<Pick<BuildingMeta, 'reserveFundBalance' | 'monthlyCollectionRate' | 'occupiedApartments'>>
): Promise<BuildingMeta> {
  const updated: BuildingMeta = { ...building, ...fields };
  const path = `buildings/${building.id}`;
  try {
    const payload = sanitizeBuildingPayload(updated);
    const { id: _id, ownerId: _ownerId, ownerEmail: _ownerEmail, ...updatable } = payload;
    await updateDoc(doc(db, 'buildings', building.id), updatable);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function confirmPaymentAtomic(
  building: BuildingMeta,
  paymentId: string,
  patch: Record<string, any>,
  reserveFundIncrement: number
): Promise<void> {
  const path = `buildings/${building.id}/payments/${paymentId}`;
  try {
    const batch = writeBatch(db);
    batch.update(
      doc(db, 'buildings', building.id, 'payments', paymentId),
      stripUndefined({
        ...patch,
        updatedAt: serverTimestamp(),
      })
    );
    if (reserveFundIncrement > 0) {
      const nextBal = Math.round(((Number(building.reserveFundBalance) || 0) + reserveFundIncrement) * 100) / 100;
      batch.update(doc(db, 'buildings', building.id), {
        reserveFundBalance: nextBal,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveSubdoc(
  subcol: string,
  record: Record<string, any> & { id: string },
  building: BuildingMeta,
  members: MemberRecord[],
  invites: InviteRecord[],
  currentUid: string,
  isNew: boolean
): Promise<void> {
  const path = `buildings/${building.id}/${subcol}/${record.id}`;
  const ref = doc(db, 'buildings', building.id, subcol, record.id);
  const payload = sanitizeSubdocPayload(subcol, record, building, members, invites, currentUid);

  try {
    await setDoc(ref, payload);
    if (isNew && building.ownerId === currentUid && invites.length > 0) {
      const matchingInvites = invites.filter((inv) =>
        memberAllowedOnDoc(subcol, inv.role, inv.apartmentNumber, payload)
      );
      if (matchingInvites.length > 0) {
        const b = writeBatch(db);
        for (const inv of matchingInvites) {
          b.update(doc(db, 'invites', inv.id), {
            [`authorizedDocs.${subcol}`]: arrayUnion(record.id),
            updatedAt: serverTimestamp(),
          });
        }
        await b.commit().catch(() => {});
      }
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function updateSubdocFields(
  subcol: string,
  buildingId: string,
  id: string,
  fields: Record<string, any>
): Promise<void> {
  const path = `buildings/${buildingId}/${subcol}/${id}`;
  try {
    await updateDoc(doc(db, 'buildings', buildingId, subcol, id), stripUndefined({
      ...fields,
      updatedAt: serverTimestamp(),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function addExpenseAtomic(
  expense: Omit<ExpenseRecord, 'id'>,
  building: BuildingMeta,
  currentUid: string
): Promise<ExpenseRecord> {
  const created: ExpenseRecord = {
    ...expense,
    id: makeId('exp'),
    buildingId: building.id,
  };
  const path = `buildings/${building.id}/expenses/${created.id}`;
  const newBalance = Math.round(((Number(building.reserveFundBalance) || 0) - created.amount) * 100) / 100;

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'buildings', building.id, 'expenses', created.id),
      sanitizeSubdocPayload('expenses', created, building, [], [], currentUid)
    );
    batch.update(doc(db, 'buildings', building.id), {
      reserveFundBalance: newBalance,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return created;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteExpenseAtomic(
  expense: ExpenseRecord,
  building: BuildingMeta
): Promise<void> {
  const path = `buildings/${building.id}/expenses/${expense.id}`;
  const newBalance = Math.round(((Number(building.reserveFundBalance) || 0) + (Number(expense.amount) || 0)) * 100) / 100;

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'buildings', building.id, 'expenses', expense.id));
    batch.update(doc(db, 'buildings', building.id), {
      reserveFundBalance: newBalance,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteSubdoc(subcol: string, buildingId: string, id: string): Promise<void> {
  const path = `buildings/${buildingId}/${subcol}/${id}`;
  try {
    await deleteDoc(doc(db, 'buildings', buildingId, subcol, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addBuildingMember(
  building: BuildingMeta,
  existingMembers: MemberRecord[],
  existingInvites: InviteRecord[],
  input: { name?: string; phone?: string; email?: string; role: UserRole; apartmentNumber?: string }
): Promise<void> {
  const nameTrim = (input.name || '').trim();
  const phoneTrim = (input.phone || '').trim();
  const emailLower = (input.email || '').trim().toLowerCase();

  if (!nameTrim && !phoneTrim && !emailLower) {
    throw new Error('Въведи поне име, телефон или имейл на човека.');
  }
  if (emailLower && !emailLower.includes('@')) {
    throw new Error('Въведеният имейл адрес е невалиден.');
  }
  if (phoneTrim && phoneTrim.replace(/\D/g, '').length < 6) {
    throw new Error('Въведи валиден телефонен номер (поне 6 цифри).');
  }
  if (input.role === 'owner') {
    throw new Error('Не може да добавяш втори собственик.');
  }
  if (input.role === 'tenant' && !input.apartmentNumber?.trim()) {
    throw new Error('За наемател трябва да посочиш апартамент.');
  }

  if (
    emailLower &&
    (emailLower === building.ownerEmail.toLowerCase() ||
      existingMembers.some((m) => m.email && m.email.toLowerCase() === emailLower) ||
      existingInvites.some((i) => i.email && i.email.toLowerCase() === emailLower))
  ) {
    throw new Error('Този имейл вече има достъп или активна покана за сградата.');
  }

  const tokens = buildIdentifierTokens({ email: emailLower, phone: phoneTrim, name: nameTrim });
  const lookupHashes = await buildLookupHashes(tokens);
  if (lookupHashes.length === 0) {
    throw new Error('Данните са твърде кратки — въведи поне 2 символа за име или валиден телефон/имейл.');
  }

  const inviteId = makeId('inv');
  const aptNum = input.role === 'tenant' ? input.apartmentNumber?.trim() : undefined;

  try {
    // Collect authorized subdoc IDs so hashed-lookup tenants can join without email queries
    const authorizedDocs: Record<string, string[]> = {};
    const emailUpdateRefs: Array<ReturnType<typeof doc>> = [];
    const subcols = SUBCOLS_BY_ROLE[input.role] || [];
    for (const subcol of subcols) {
      const snap = await getDocs(collection(db, 'buildings', building.id, subcol));
      const matchedIds: string[] = [];
      for (const d of snap.docs) {
        if (memberAllowedOnDoc(subcol, input.role, aptNum, d.data())) {
          matchedIds.push(d.id);
          if (emailLower) {
            emailUpdateRefs.push(d.ref);
          }
        }
      }
      if (matchedIds.length > 0) {
        authorizedDocs[subcol] = matchedIds;
      }
    }

    // Check which lookupHashes already exist so we set vs update atomically in the same batch as invite creation
    const existingLookups = await Promise.all(
      lookupHashes.map(async (h) => {
        const ref = doc(db, 'inviteLookups', h);
        const s = await getDoc(ref);
        return { hash: h, ref, exists: s.exists() };
      })
    );

    const batch = writeBatch(db);
    batch.set(
      doc(db, 'invites', inviteId),
      stripUndefined({
        id: inviteId,
        buildingId: building.id,
        buildingName: building.name,
        ownerId: building.ownerId,
        email: emailLower,
        phone: phoneTrim || undefined,
        name: nameTrim || undefined,
        role: input.role,
        apartmentNumber: aptNum,
        lookupHashes,
        claimedUids: [],
        authorizedDocs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    for (const lkp of existingLookups) {
      if (lkp.exists) {
        batch.update(lkp.ref, {
          inviteIds: arrayUnion(inviteId),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(lkp.ref, {
          id: lkp.hash,
          inviteIds: [inviteId],
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (emailLower) {
      batch.update(doc(db, 'buildings', building.id), {
        invitedEmails: arrayUnion(emailLower),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    for (const chunkRefs of chunk(emailUpdateRefs, 400)) {
      const b = writeBatch(db);
      for (const ref of chunkRefs) {
        b.update(ref, { invitedEmails: arrayUnion(emailLower), updatedAt: serverTimestamp() });
      }
      await b.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `invites/${inviteId}`);
  }
}

export async function removeBuildingMember(
  building: BuildingMeta,
  member: MemberRecord & { uids?: string[] },
  invites: InviteRecord[] = []
): Promise<void> {
  const emailLower = (member.email || '').trim().toLowerCase();
  const matchedInvite =
    (member.inviteId ? invites.find((i) => i.id === member.inviteId) : undefined) ||
    (emailLower ? invites.find((i) => i.email.toLowerCase() === emailLower) : undefined);

  const uidsToRevoke = uniqueStrings([
    member.uid,
    ...(member.uids || []),
    ...(matchedInvite?.claimedUids || []),
  ]);

  try {
    // 1. Clean up inviteLookups & delete invite if present
    if (matchedInvite) {
      if (Array.isArray(matchedInvite.lookupHashes) && matchedInvite.lookupHashes.length > 0) {
        for (const h of matchedInvite.lookupHashes) {
          try {
            const lRef = doc(db, 'inviteLookups', h);
            const lSnap = await getDoc(lRef);
            if (lSnap.exists()) {
              const ids: string[] = Array.isArray(lSnap.data().inviteIds) ? lSnap.data().inviteIds : [];
              const remaining = ids.filter((id) => id !== matchedInvite.id);
              if (remaining.length === 0) {
                await deleteDoc(lRef);
              } else {
                await updateDoc(lRef, {
                  inviteIds: arrayRemove(matchedInvite.id),
                  updatedAt: serverTimestamp(),
                });
              }
            }
          } catch {
            // Continue cleanup
          }
        }
      }
      await deleteDoc(doc(db, 'invites', matchedInvite.id));
    } else if (member.inviteId) {
      await deleteDoc(doc(db, 'invites', member.inviteId)).catch(() => {});
    }

    // 2. Delete all member docs for this invite/member
    for (const rUid of uidsToRevoke) {
      await deleteDoc(doc(db, 'buildings', building.id, 'members', rUid)).catch(() => {});
    }

    // 3. Remove uids & email from building + subcollections
    const buildingUpdate: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (emailLower) {
      buildingUpdate.invitedEmails = arrayRemove(emailLower);
    }
    if (uidsToRevoke.length > 0) {
      buildingUpdate.memberUids = arrayRemove(...uidsToRevoke);
    }
    if (emailLower || uidsToRevoke.length > 0) {
      await updateDoc(doc(db, 'buildings', building.id), buildingUpdate);
    }

    const subUpdate: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (emailLower) {
      subUpdate.invitedEmails = arrayRemove(emailLower);
    }
    if (uidsToRevoke.length > 0) {
      subUpdate.memberUids = arrayRemove(...uidsToRevoke);
    }

    if (emailLower || uidsToRevoke.length > 0) {
      const refs: Array<ReturnType<typeof doc>> = [];
      for (const subcol of ['apartments', 'payments', 'appliances', 'repairTickets', 'defects', 'calendarEvents']) {
        const snap = await getDocs(collection(db, 'buildings', building.id, subcol));
        for (const d of snap.docs) {
          const data = d.data();
          const hasUid =
            uidsToRevoke.length > 0 &&
            Array.isArray(data.memberUids) &&
            uidsToRevoke.some((u) => data.memberUids.includes(u));
          const hasEmail = emailLower && Array.isArray(data.invitedEmails) && data.invitedEmails.includes(emailLower);
          if (hasUid || hasEmail) {
            refs.push(d.ref);
          }
        }
      }

      for (const chunkRefs of chunk(refs, 400)) {
        const b = writeBatch(db);
        for (const ref of chunkRefs) {
          b.update(ref, subUpdate);
        }
        await b.commit();
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `buildings/${building.id}/members`);
  }
}

export async function deleteBuildingCascade(buildingId: string): Promise<void> {
  const path = `buildings/${buildingId}`;
  try {
    // 1. Delete subcollections that do not require !existsAfter(building)
    for (const subcol of ['apartments', 'payments', 'appliances', 'repairTickets', 'defects', 'calendarEvents']) {
      const snap = await getDocs(collection(db, 'buildings', buildingId, subcol));
      for (const batchDocs of chunk(snap.docs, 400)) {
        const b = writeBatch(db);
        for (const d of batchDocs) b.delete(d.ref);
        await b.commit();
      }
    }

    // 2. Clean up inviteLookups & delete invites linked to this building
    const invSnap = await getDocs(query(collection(db, 'invites'), where('buildingId', '==', buildingId)));
    for (const invDoc of invSnap.docs) {
      const inv = invDoc.data() as InviteRecord;
      if (Array.isArray(inv.lookupHashes)) {
        for (const h of inv.lookupHashes) {
          try {
            const lRef = doc(db, 'inviteLookups', h);
            const lSnap = await getDoc(lRef);
            if (lSnap.exists()) {
              const ids: string[] = Array.isArray(lSnap.data().inviteIds) ? lSnap.data().inviteIds : [];
              const remaining = ids.filter((id) => id !== invDoc.id);
              if (remaining.length === 0) {
                await deleteDoc(lRef);
              } else {
                await updateDoc(lRef, { inviteIds: arrayRemove(invDoc.id), updatedAt: serverTimestamp() });
              }
            }
          } catch {
            // Continue cleanup
          }
        }
      }
    }
    for (const batchDocs of chunk(invSnap.docs, 400)) {
      const b = writeBatch(db);
      for (const d of batchDocs) b.delete(d.ref);
      await b.commit();
    }

    // 3. Delete expenses + members + building document in the SAME final batch so !existsAfter(building) passes
    const expSnap = await getDocs(collection(db, 'buildings', buildingId, 'expenses'));
    const memSnap = await getDocs(collection(db, 'buildings', buildingId, 'members'));
    const finalRefs = [...expSnap.docs.map((d) => d.ref), ...memSnap.docs.map((d) => d.ref), doc(db, 'buildings', buildingId)];
    const finalBatch = writeBatch(db);
    for (const ref of finalRefs) {
      finalBatch.delete(ref);
    }
    await finalBatch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeUserBuildings(
  uid: string,
  onChange: (buildings: BuildingMeta[]) => void
): Unsubscribe {
  const path = 'buildings';
  const q = query(collection(db, 'buildings'), where('memberUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as BuildingMeta);
      list.sort((a, b) => a.name.localeCompare(b.name, 'bg'));
      onChange(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeBuildingData(
  building: BuildingMeta,
  uid: string,
  isAdminUser: boolean,
  callbacks: {
    onMembers: (members: MemberRecord[]) => void;
    onInvites: (invites: InviteRecord[]) => void;
    onApartments: (items: Apartment[]) => void;
    onPayments: (items: PaymentObligation[]) => void;
    onAppliances: (items: Appliance[]) => void;
    onRepairTickets: (items: RepairTicket[]) => void;
    onDefects: (items: ConstructionDefect[]) => void;
    onCalendarEvents: (items: CalendarEvent[]) => void;
    onExpenses: (items: ExpenseRecord[]) => void;
  }
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  const bid = building.id;
  const isOwner = building.ownerId === uid;

  // Members: owner lists by ownerId, member lists their own doc by uid
  const membersQ = isOwner
    ? query(collection(db, 'buildings', bid, 'members'), where('ownerId', '==', building.ownerId))
    : isAdminUser
      ? collection(db, 'buildings', bid, 'members')
      : query(collection(db, 'buildings', bid, 'members'), where('uid', '==', uid));

  unsubs.push(
    onSnapshot(
      membersQ,
      (snap) => callbacks.onMembers(snap.docs.map((d) => d.data() as MemberRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, `buildings/${bid}/members`)
    )
  );

  // Invites (only owner / admin manages invites)
  if (isOwner || isAdminUser) {
    const invQ = isAdminUser
      ? collection(db, 'invites')
      : query(collection(db, 'invites'), where('ownerId', '==', building.ownerId));
    unsubs.push(
      onSnapshot(
        invQ,
        (snap) => {
          const items = snap.docs
            .map((d) => d.data() as InviteRecord)
            .filter((i) => i.buildingId === bid);
          callbacks.onInvites(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'invites')
      )
    );
  } else {
    callbacks.onInvites([]);
  }

  const subcolList = [
    { name: 'apartments', cb: callbacks.onApartments },
    { name: 'payments', cb: callbacks.onPayments },
    { name: 'appliances', cb: callbacks.onAppliances },
    { name: 'repairTickets', cb: callbacks.onRepairTickets },
    { name: 'defects', cb: callbacks.onDefects },
    { name: 'calendarEvents', cb: callbacks.onCalendarEvents },
  ] as const;

  for (const { name, cb } of subcolList) {
    const q = isAdminUser
      ? collection(db, 'buildings', bid, name)
      : query(collection(db, 'buildings', bid, name), where('memberUids', 'array-contains', uid));
    unsubs.push(
      onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => d.data() as any)),
        (err) => handleFirestoreError(err, OperationType.LIST, `buildings/${bid}/${name}`)
      )
    );
  }

  // Expenses: strictly owner or admin
  if (isOwner || isAdminUser) {
    const expQ = isAdminUser
      ? collection(db, 'buildings', bid, 'expenses')
      : query(collection(db, 'buildings', bid, 'expenses'), where('ownerId', '==', building.ownerId));
    unsubs.push(
      onSnapshot(
        expQ,
        (snap) => callbacks.onExpenses(snap.docs.map((d) => d.data() as ExpenseRecord)),
        (err) => handleFirestoreError(err, OperationType.LIST, `buildings/${bid}/expenses`)
      )
    );
  } else {
    callbacks.onExpenses([]);
  }

  return () => {
    for (const u of unsubs) u();
  };
}

// Admin queries
export interface AdminOverviewData {
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    createdAt: string;
    buildings: number;
  }>;
  buildings: Array<{
    id: string;
    name: string;
    city: string;
    owners: string | null;
    members: number;
    records: number;
  }>;
}

export async function fetchAdminOverview(): Promise<AdminOverviewData> {
  try {
    const [usersSnap, buildingsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'buildings')),
    ]);

    const buildingsDocs = buildingsSnap.docs.map((d) => d.data() as BuildingMeta);

    const buildings = await Promise.all(
      buildingsDocs.map(async (b) => {
        const subNames = ['apartments', 'payments', 'appliances', 'repairTickets', 'defects', 'calendarEvents', 'expenses'];
        const counts = await Promise.all(
          subNames.map(async (s) => (await getDocs(collection(db, 'buildings', b.id, s))).size)
        );
        return {
          id: b.id,
          name: b.name,
          city: b.city,
          owners: b.ownerEmail || b.contactManager || null,
          members: b.memberUids?.length || 1,
          records: counts.reduce((acc, c) => acc + c, 0),
        };
      })
    );

    const users = usersSnap.docs.map((d) => {
      const u = d.data() as UserDocData & { createdAt?: { toDate?: () => Date } };
      const count = buildingsDocs.filter((b) => b.memberUids?.includes(u.uid)).length;
      const createdIso = u.createdAt?.toDate ? u.createdAt.toDate().toISOString() : new Date().toISOString();
      return {
        id: u.uid,
        email: u.email,
        name: u.name,
        role: u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user',
        createdAt: createdIso,
        buildings: count,
      };
    });

    return { users, buildings };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admin');
  }
}

export async function deleteUserAsAdmin(userId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
  }
}

export async function syncOwnerAclsIfNeeded(
  building: BuildingMeta,
  members: MemberRecord[],
  invites: InviteRecord[],
  subcol: string,
  docs: Array<Record<string, any> & { id: string; memberUids?: string[]; invitedEmails?: string[] }>
): Promise<void> {
  const toUpdate: Array<{ ref: ReturnType<typeof doc>; memberUids: string[]; invitedEmails: string[] }> = [];
  for (const d of docs) {
    const desired = buildAclForDoc(subcol, building.ownerId, members, invites, d);
    const curUids = Array.isArray(d.memberUids) ? [...d.memberUids].sort().join(',') : '';
    const desUids = [...desired.memberUids].sort().join(',');
    const curEmails = Array.isArray(d.invitedEmails) ? [...d.invitedEmails].sort().join(',') : '';
    const desEmails = [...desired.invitedEmails].sort().join(',');
    if (curUids !== desUids || curEmails !== desEmails) {
      toUpdate.push({
        ref: doc(db, 'buildings', building.id, subcol, d.id),
        memberUids: desired.memberUids,
        invitedEmails: desired.invitedEmails,
      });
    }
  }
  if (toUpdate.length === 0) return;
  try {
    for (const batchItems of chunk(toUpdate, 400)) {
      const b = writeBatch(db);
      for (const item of batchItems) {
        b.update(item.ref, {
          memberUids: item.memberUids,
          invitedEmails: item.invitedEmails,
          updatedAt: serverTimestamp(),
        });
      }
      await b.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `buildings/${building.id}/${subcol}`);
  }
}
