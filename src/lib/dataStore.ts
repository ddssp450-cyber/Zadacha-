import {
  Apartment,
  Appliance,
  Building,
  CalendarEvent,
  ConstructionDefect,
  ExpenseRecord,
  PaymentObligation,
  RepairTicket,
  UserProfile,
} from '../types';
import type { BuildingFields, Member } from '../components/BuildingAdmin';
import { apiFetch } from './apiClient';

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
}

export interface MemberRecord extends Member {
  uid?: string;
  inviteId?: string;
  ownerId?: string;
  buildingId?: string;
  phone?: string | null;
}

export interface BuildingBundle {
  building: BuildingMeta;
  members: MemberRecord[];
  invites: InviteRecord[];
  apartments: Apartment[];
  payments: PaymentObligation[];
  appliances: Appliance[];
  repairTickets: RepairTicket[];
  defects: ConstructionDefect[];
  calendarEvents: CalendarEvent[];
  expenses: ExpenseRecord[];
}

export interface AdminOverviewData {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    buildings: number;
    createdAt: string;
  }>;
  buildings: Array<{
    id: string;
    name: string;
    city: string;
    owners: string;
    members: number;
    records: number;
  }>;
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now()}-${rand}`;
}

export async function fetchUserBuildings(): Promise<BuildingMeta[]> {
  const data = await apiFetch<{ buildings: BuildingMeta[] }>('/api/buildings', { method: 'GET' });
  return data.buildings || [];
}

export async function fetchBuildingData(buildingId: string): Promise<BuildingBundle> {
  return apiFetch<BuildingBundle>(`/api/buildings/${encodeURIComponent(buildingId)}/data`, {
    method: 'GET',
  });
}

export async function createBuildingInDb(fields: BuildingFields): Promise<BuildingMeta> {
  const data = await apiFetch<{ building: BuildingMeta }>('/api/buildings', {
    method: 'POST',
    body: JSON.stringify(fields),
  });
  return data.building;
}

export async function updateBuildingDetails(
  buildingId: string,
  fields: Partial<BuildingFields> & {
    reserveFundBalance?: number;
    exteriorImage?: string;
    lobbyImage?: string;
    facilities?: string[];
  }
): Promise<BuildingMeta> {
  const data = await apiFetch<{ building: BuildingMeta }>(`/api/buildings/${encodeURIComponent(buildingId)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  return data.building;
}

export async function updateActiveBuilding(buildingId: string): Promise<void> {
  await apiFetch(`/api/buildings/${encodeURIComponent(buildingId)}/active`, {
    method: 'POST',
  });
}

export async function deleteBuildingCascade(buildingId: string): Promise<void> {
  await apiFetch(`/api/buildings/${encodeURIComponent(buildingId)}`, {
    method: 'DELETE',
  });
}

export async function claimPendingInvites(): Promise<string[]> {
  const data = await apiFetch<{ claimedBuildingIds: string[] }>('/api/invites/claim', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return data.claimedBuildingIds || [];
}

export async function claimInvitesByIdentifier(identifier: string): Promise<string[]> {
  const data = await apiFetch<{ claimedBuildingIds: string[] }>('/api/invites/claim', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
  return data.claimedBuildingIds || [];
}

export async function addBuildingMember(
  buildingId: string,
  member: { name?: string; phone?: string; email?: string; role: UserProfile['role']; apartmentNumber?: string }
): Promise<void> {
  await apiFetch(`/api/buildings/${encodeURIComponent(buildingId)}/members`, {
    method: 'POST',
    body: JSON.stringify(member),
  });
}

export async function removeBuildingMember(buildingId: string, member: Member): Promise<void> {
  await apiFetch(`/api/buildings/${encodeURIComponent(buildingId)}/members`, {
    method: 'DELETE',
    body: JSON.stringify({
      uid: member.uid,
      uids: member.uids,
      inviteId: member.inviteId,
      email: member.email,
    }),
  });
}

export async function createSubdoc<T extends Record<string, any>>(
  subcol: string,
  buildingId: string,
  record: T
): Promise<T> {
  const data = await apiFetch<{ record: T }>(
    `/api/buildings/${encodeURIComponent(buildingId)}/records/${encodeURIComponent(subcol)}`,
    {
      method: 'POST',
      body: JSON.stringify(record),
    }
  );
  return data.record;
}

export async function updateSubdocFields(
  subcol: string,
  buildingId: string,
  recordId: string,
  patch: Record<string, any>,
  reserveIncrement = 0
): Promise<void> {
  await apiFetch(
    `/api/buildings/${encodeURIComponent(buildingId)}/records/${encodeURIComponent(subcol)}/${encodeURIComponent(recordId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ patch, reserveIncrement }),
    }
  );
}

export async function deleteSubdoc(subcol: string, buildingId: string, recordId: string): Promise<void> {
  await apiFetch(
    `/api/buildings/${encodeURIComponent(buildingId)}/records/${encodeURIComponent(subcol)}/${encodeURIComponent(recordId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function fetchAdminOverview(): Promise<AdminOverviewData> {
  return apiFetch<AdminOverviewData>('/api/admin/overview', { method: 'GET' });
}

export async function deleteUserAsAdmin(userId: string): Promise<void> {
  await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}
