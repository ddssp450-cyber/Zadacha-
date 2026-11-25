/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { BuildingsView } from './components/BuildingsView';
import { PaymentsView } from './components/PaymentsView';
import { RepairsView } from './components/RepairsView';
import { CalendarView } from './components/CalendarView';
import { AppliancesView } from './components/AppliancesView';
import { ExpensesView } from './components/ExpensesView';
import { AIAssistantModal } from './components/AIAssistantModal';
import { AuthModal } from './components/AuthModal';
import { CameraDiagnosisModal } from './components/CameraDiagnosisModal';
import { AccessGate, BuildingFields, Member } from './components/BuildingAdmin';
import { AdminView } from './components/AdminView';

import {
  UserProfile,
  UserRole,
  Apartment,
  PaymentObligation,
  RepairTicket,
  ConstructionDefect,
  CalendarEvent,
  ExpenseRecord,
  Appliance,
} from './types';

import {
  AppAuthUser,
  logoutSession,
  refreshSession,
  subscribeAuth,
} from './lib/apiClient';
import {
  BuildingMeta,
  InviteRecord,
  MemberRecord,
  addBuildingMember,
  claimInvitesByIdentifier,
  claimPendingInvites,
  createBuildingInDb,
  createSubdoc,
  deleteBuildingCascade,
  deleteSubdoc,
  fetchBuildingData,
  fetchUserBuildings,
  makeId,
  removeBuildingMember,
  updateActiveBuilding,
  updateBuildingDetails,
  updateSubdocFields,
} from './lib/dataStore';

function diffEditableFields<T extends Record<string, any>>(prev: T | undefined, next: T): Record<string, any> {
  const immutable = new Set(['id', 'buildingId', 'ownerId', 'createdByUid', 'memberUids', 'invitedEmails', 'createdAt', 'updatedAt']);
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(next)) {
    if (immutable.has(k) || v === undefined) continue;
    if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(v)) {
      patch[k] = v;
    }
  }
  return patch;
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'signedOut'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [authUser, setAuthUser] = useState<AppAuthUser | null>(null);
  const [preferredBuildingId, setPreferredBuildingId] = useState<string>('');

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCameraDiagnosisOpen, setIsCameraDiagnosisOpen] = useState(false);

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [highlightItemId, setHighlightItemId] = useState<string | undefined>(undefined);

  const [buildings, setBuildings] = useState<BuildingMeta[]>([]);
  const [membersRaw, setMembersRaw] = useState<MemberRecord[]>([]);
  const [invitesRaw, setInvitesRaw] = useState<InviteRecord[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [payments, setPayments] = useState<PaymentObligation[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [repairTickets, setRepairTickets] = useState<RepairTicket[]>([]);
  const [defects, setDefects] = useState<ConstructionDefect[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  const [isExternalNewTicketOpen, setIsExternalNewTicketOpen] = useState(false);
  const [isExternalNewEventOpen, setIsExternalNewEventOpen] = useState(false);

  const clearBuildingState = useCallback(() => {
    setBuildings([]);
    setMembersRaw([]);
    setInvitesRaw([]);
    setApartments([]);
    setPayments([]);
    setAppliances([]);
    setRepairTickets([]);
    setDefects([]);
    setCalendarEvents([]);
    setExpenses([]);
  }, []);

  const loadBuildingsForUser = useCallback(async (user: AppAuthUser) => {
    setLoadError(null);
    try {
      const list = await fetchUserBuildings();
      setBuildings(list);
      if (user.activeBuildingId && list.some((b) => b.id === user.activeBuildingId)) {
        setPreferredBuildingId(user.activeBuildingId);
      } else if (list.length > 0) {
        setPreferredBuildingId((prev) => (prev && list.some((b) => b.id === prev) ? prev : list[0].id));
      } else {
        setPreferredBuildingId('');
      }
      setStatus('ready');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Грешка при свързване със сървъра.');
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeAuth((user) => {
      if (!user) {
        setAuthUser(null);
        setPreferredBuildingId('');
        clearBuildingState();
        setLoadError(null);
        setStatus('signedOut');
        return;
      }
      setAuthUser(user);
      setStatus('loading');
      loadBuildingsForUser(user);
    });

    refreshSession();
    return unsub;
  }, [clearBuildingState, loadBuildingsForUser]);

  const isAdmin = Boolean(authUser?.isAdmin);

  const building = useMemo<BuildingMeta | null>(() => {
    if (buildings.length === 0) return null;
    return buildings.find((b) => b.id === preferredBuildingId) || buildings[0];
  }, [buildings, preferredBuildingId]);

  const syncActiveBuilding = useCallback(async (buildingId: string) => {
    try {
      const bundle = await fetchBuildingData(buildingId);
      setBuildings((prev) => prev.map((b) => (b.id === bundle.building.id ? bundle.building : b)));
      setMembersRaw(bundle.members || []);
      setInvitesRaw(bundle.invites || []);
      setApartments(bundle.apartments || []);
      setPayments(bundle.payments || []);
      setAppliances(bundle.appliances || []);
      setRepairTickets(bundle.repairTickets || []);
      setDefects(bundle.defects || []);
      setCalendarEvents(bundle.calendarEvents || []);
      setExpenses(bundle.expenses || []);
    } catch (err) {
      console.error('Building sync error:', err);
    }
  }, []);

  useEffect(() => {
    if (!authUser || !building || status !== 'ready') {
      setMembersRaw([]);
      setInvitesRaw([]);
      setApartments([]);
      setPayments([]);
      setAppliances([]);
      setRepairTickets([]);
      setDefects([]);
      setCalendarEvents([]);
      setExpenses([]);
      return;
    }

    syncActiveBuilding(building.id);

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncActiveBuilding(building.id);
      }
    }, 10000);

    return () => window.clearInterval(timer);
  }, [authUser?.id, building?.id, status, syncActiveBuilding]);

  const currentUser = useMemo<UserProfile | null>(() => {
    if (!authUser) return null;
    const myMember = membersRaw.find((m) => m.uid === authUser.id);
    const role: UserRole =
      building && building.ownerId === authUser.id
        ? 'owner'
        : myMember?.role || (authUser.isAnonymous ? 'tenant' : 'owner');
    const apartmentNumber = myMember?.apartmentNumber || undefined;

    let roleTitle = 'Собственик & Управител на Етажна Собственост';
    if (role === 'tenant') roleTitle = apartmentNumber ? `Наемател — Апартамент ${apartmentNumber}` : 'Наемател';
    else if (role === 'builder') roleTitle = 'Строителен ръководител / Инспектор';
    else if (role === 'craftsman') roleTitle = 'Техник / Майстор';

    return {
      id: authUser.id,
      name: authUser.name || authUser.email || 'Потребител',
      email: authUser.isAnonymous ? '' : authUser.email || '',
      phone: authUser.phone || '',
      role,
      roleTitle,
      apartmentNumber,
      buildingId: building?.id || '',
      avatarUrl: authUser.avatarUrl || '',
    };
  }, [authUser, building, membersRaw]);

  const members = useMemo<Member[]>(() => {
    const result: Member[] = [];
    const consumedMemberUids = new Set<string>();

    for (const m of membersRaw) {
      if (m.role === 'owner' || !m.inviteId) {
        if (m.uid) consumedMemberUids.add(m.uid);
        result.push({
          email: m.email,
          phone: m.phone,
          role: m.role,
          apartmentNumber: m.apartmentNumber,
          name: m.name,
          uid: m.uid,
          uids: m.uid ? [m.uid] : [],
          inviteId: m.inviteId,
        });
      }
    }

    for (const inv of invitesRaw) {
      const matched = membersRaw.filter(
        (m) =>
          m.role !== 'owner' &&
          (m.inviteId === inv.id || (inv.email && m.email && m.email.toLowerCase() === inv.email.toLowerCase()))
      );
      const uids = matched.map((m) => m.uid).filter((u): u is string => Boolean(u));
      for (const u of uids) consumedMemberUids.add(u);

      result.push({
        email: matched[0]?.email || inv.email || '',
        phone: matched[0]?.phone || inv.phone || null,
        role: inv.role,
        apartmentNumber: inv.apartmentNumber ?? matched[0]?.apartmentNumber,
        name: matched[0]?.name || inv.name || null,
        uid: uids[0],
        uids,
        inviteId: inv.id,
      });
    }

    for (const m of membersRaw) {
      if (m.uid && consumedMemberUids.has(m.uid)) continue;
      result.push({
        email: m.email,
        phone: m.phone,
        role: m.role,
        apartmentNumber: m.apartmentNumber,
        name: m.name,
        uid: m.uid,
        uids: m.uid ? [m.uid] : [],
        inviteId: m.inviteId,
      });
    }

    return result;
  }, [membersRaw, invitesRaw]);

  const canCreateBuildings =
    Boolean(authUser && !authUser.isAnonymous) &&
    (!building || currentUser?.role === 'owner' || isAdmin);

  const persistCall = (call: Promise<unknown>, refreshAfter = false) =>
    call
      .then(() => {
        if (refreshAfter && building) {
          return syncActiveBuilding(building.id);
        }
      })
      .catch((err) => {
        console.error(err);
        setSaveError(err instanceof Error ? err.message : 'Последната промяна не беше записана.');
        if (building) syncActiveBuilding(building.id);
      });

  const handleLogout = () => {
    logoutSession().catch((err) => console.error(err));
  };

  const handleRecheckInvites = async () => {
    if (!authUser) return;
    try {
      const claimed = await claimPendingInvites();
      await loadBuildingsForUser(authUser);
      if (claimed[0]) {
        setPreferredBuildingId(claimed[0]);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Грешка при проверка на покани.');
    }
  };

  const handleClaimByIdentifier = async (identifier: string): Promise<number> => {
    if (!authUser) return 0;
    const claimedBuildingIds = await claimInvitesByIdentifier(identifier);
    if (claimedBuildingIds.length > 0) {
      await loadBuildingsForUser(authUser);
      setPreferredBuildingId(claimedBuildingIds[0]);
      setCurrentTab('dashboard');
    }
    return claimedBuildingIds.length;
  };

  const handleNavigateTab = (tab: string, highlightId?: string) => {
    setCurrentTab(tab);
    setHighlightItemId(highlightId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenAiChatWithPrompt = (prompt: string) => {
    setAiInitialPrompt(prompt);
    setIsAiModalOpen(true);
  };

  // Payment operations
  const handleUpdatePayment = (updated: PaymentObligation) => {
    if (!building) return;
    const prev = payments.find((p) => p.id === updated.id);
    const patch = diffEditableFields(prev, updated);
    if (Object.keys(patch).length === 0) return;
    setPayments((list) => list.map((p) => (p.id === updated.id ? updated : p)));
    const reserveIncrement =
      prev?.status !== 'confirmed_paid' && updated.status === 'confirmed_paid' && updated.type === 'repair_fund'
        ? Number(updated.paidAmount ?? updated.amount) || 0
        : 0;
    persistCall(updateSubdocFields('payments', building.id, updated.id, patch, reserveIncrement), reserveIncrement > 0);
  };

  const handleCreatePayment = (newP: Omit<PaymentObligation, 'id'>) => {
    if (!building) return;
    const created: PaymentObligation = {
      ...newP,
      buildingId: building.id,
      id: makeId('pay'),
    };
    setPayments((list) => [created, ...list]);
    persistCall(createSubdoc('payments', building.id, created));
  };

  // Repair operations
  const handleUpdateTicket = (updated: RepairTicket) => {
    if (!building) return;
    const prev = repairTickets.find((t) => t.id === updated.id);
    const patch = diffEditableFields(prev, {
      ...updated,
      assignedCraftsmanName: updated.assignedCraftsmanName ?? '',
    });
    if (Object.keys(patch).length === 0) return;
    setRepairTickets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    persistCall(updateSubdocFields('repairTickets', building.id, updated.id, patch));
  };

  const handleCreateTicket = (newT: Omit<RepairTicket, 'id' | 'ticketNumber'>) => {
    if (!building) return;
    const count = repairTickets.length + 1;
    const ticketNumber = `REM-${new Date().getFullYear()}-0${count < 10 ? '0' + count : count}`;
    const created: RepairTicket = {
      ...newT,
      buildingId: building.id,
      id: makeId('rep'),
      ticketNumber,
    };
    setRepairTickets((list) => [created, ...list]);
    persistCall(createSubdoc('repairTickets', building.id, created));

    if (currentUser?.role === 'tenant') return;
    const newEvent: CalendarEvent = {
      id: makeId('evt'),
      title: `Ремонт: ${created.title}`,
      category: 'repair',
      startDateTime: `${created.deadlineDate}T10:00:00`,
      endDateTime: `${created.deadlineDate}T12:00:00`,
      buildingId: building.id,
      apartmentNumber: created.apartmentNumber,
      assignedToName: created.assignedCraftsmanName || 'Майстор',
      assignedRole: 'craftsman',
      status: 'pending',
      description: created.description,
      priority: created.priority === 'urgent' ? 'urgent' : 'high',
    };
    setCalendarEvents((list) => [newEvent, ...list]);
    persistCall(createSubdoc('calendarEvents', building.id, newEvent));
  };

  // Defect operations
  const handleUpdateDefect = (updated: ConstructionDefect) => {
    if (!building) return;
    const prev = defects.find((d) => d.id === updated.id);
    const patch = diffEditableFields(prev, updated);
    if (Object.keys(patch).length === 0) return;
    setDefects((list) => list.map((d) => (d.id === updated.id ? updated : d)));
    persistCall(updateSubdocFields('defects', building.id, updated.id, patch));
  };

  const handleCreateDefect = (newD: Omit<ConstructionDefect, 'id' | 'defectNumber'>) => {
    if (!building) return;
    const count = defects.length + 1;
    const created: ConstructionDefect = {
      ...newD,
      buildingId: building.id,
      id: makeId('def'),
      defectNumber: `DEF-${new Date().getFullYear()}-0${count < 10 ? '0' + count : count}`,
    };
    setDefects((list) => [created, ...list]);
    persistCall(createSubdoc('defects', building.id, created));
  };

  // Calendar operations
  const handleCreateEvent = (newEventData: Omit<CalendarEvent, 'id'>) => {
    if (!building) return;
    const created: CalendarEvent = {
      ...newEventData,
      buildingId: building.id,
      id: makeId('evt'),
    };
    setCalendarEvents((list) => [created, ...list]);
    persistCall(createSubdoc('calendarEvents', building.id, created));
  };

  const handleUpdateEventStatus = (eventId: string, newStatus: CalendarEvent['status']) => {
    if (!building) return;
    setCalendarEvents((list) => list.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e)));
    persistCall(updateSubdocFields('calendarEvents', building.id, eventId, { status: newStatus }));
  };

  const handleUpdateEvent = (updated: CalendarEvent) => {
    if (!building) return;
    const prev = calendarEvents.find((e) => e.id === updated.id);
    const patch = diffEditableFields(prev, updated);
    if (Object.keys(patch).length === 0) return;
    setCalendarEvents((list) => list.map((e) => (e.id === updated.id ? updated : e)));
    persistCall(updateSubdocFields('calendarEvents', building.id, updated.id, patch));
  };

  // Apartment meter / edit operations
  const handleUpdateApartment = (updated: Apartment) => {
    if (!building) return;
    const prev = apartments.find((a) => a.id === updated.id);
    const patch = diffEditableFields(prev, updated);
    if (Object.keys(patch).length === 0) return;
    setApartments((list) => list.map((a) => (a.id === updated.id ? updated : a)));
    persistCall(updateSubdocFields('apartments', building.id, updated.id, patch));
  };

  const handleSaveApartment = (apt: Apartment) => {
    if (!building) return;
    const existing = apartments.find((a) => a.id === apt.id);
    const normalized: Apartment = { ...apt, buildingId: building.id };
    if (existing) {
      handleUpdateApartment(normalized);
    } else {
      setApartments((list) => [...list, normalized]);
      persistCall(createSubdoc('apartments', building.id, normalized));
    }
  };

  // Expense operations
  const handleAddExpense = (newExp: Omit<ExpenseRecord, 'id'>) => {
    if (!building) return;
    const created: ExpenseRecord = {
      ...newExp,
      buildingId: building.id,
      id: makeId('exp'),
    };
    setExpenses((list) => [created, ...list]);
    persistCall(createSubdoc('expenses', building.id, created), true);
  };

  const handleApproveExpense = (expenseId: string) => {
    if (!building) return;
    setExpenses((list) => list.map((e) => (e.id === expenseId ? { ...e, status: 'paid', approvedByOwner: true } : e)));
    persistCall(updateSubdocFields('expenses', building.id, expenseId, { status: 'paid', approvedByOwner: true }));
  };

  // Appliance maintenance logging
  const handleAddApplianceServiceLog = (
    applianceId: string,
    log: { date: string; technicianName: string; description: string; cost: number }
  ) => {
    if (!building) return;
    const app = appliances.find((a) => a.id === applianceId);
    if (!app) return;
    const serviceHistory = [{ id: makeId('sh'), ...log }, ...app.serviceHistory];
    const updated: Appliance = {
      ...app,
      status: 'operational',
      lastServicedAt: log.date,
      serviceHistory,
    };
    setAppliances((list) => list.map((a) => (a.id === applianceId ? updated : a)));
    persistCall(
      updateSubdocFields('appliances', building.id, applianceId, {
        status: 'operational',
        lastServicedAt: log.date,
        serviceHistory,
      })
    );
  };

  // Building & membership operations
  const handleCreateBuilding = async (fields: BuildingFields) => {
    const created = await createBuildingInDb(fields);
    setBuildings((prev) => [created, ...prev]);
    setPreferredBuildingId(created.id);
    setCurrentTab('buildings');
  };

  const handleUpdateBuilding = async (fields: BuildingFields) => {
    if (!building) return;
    const updated = await updateBuildingDetails(building.id, fields);
    setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  const handleUpdateBankDetails = async (fields: { iban: string; bankName: string; contactManager: string }) => {
    if (!building) return;
    const updated = await updateBuildingDetails(building.id, fields);
    setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  const handleUpdateReserveBalance = async (newBalance: number) => {
    if (!building) return;
    const updated = await updateBuildingDetails(building.id, { reserveFundBalance: newBalance });
    setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  const handleSwitchBuilding = (buildingId: string) => {
    setPreferredBuildingId(buildingId);
    setCurrentTab('dashboard');
    persistCall(updateActiveBuilding(buildingId));
  };

  const handleAddMember = async (m: {
    name?: string;
    phone?: string;
    email?: string;
    role: UserProfile['role'];
    apartmentNumber?: string;
  }) => {
    if (!building) return;
    await addBuildingMember(building.id, m);
    await syncActiveBuilding(building.id);
  };

  const handleRemoveMember = async (member: Member) => {
    if (!building) return;
    await removeBuildingMember(building.id, member);
    await syncActiveBuilding(building.id);
  };

  const deleteRecord = (subcol: string, id: string) => {
    if (!building) return;
    if (subcol === 'payments') setPayments((l) => l.filter((x) => x.id !== id));
    if (subcol === 'apartments') setApartments((l) => l.filter((x) => x.id !== id));
    if (subcol === 'repairTickets') setRepairTickets((l) => l.filter((x) => x.id !== id));
    if (subcol === 'defects') setDefects((l) => l.filter((x) => x.id !== id));
    if (subcol === 'calendarEvents') setCalendarEvents((l) => l.filter((x) => x.id !== id));
    if (subcol === 'expenses') setExpenses((l) => l.filter((x) => x.id !== id));
    persistCall(deleteSubdoc(subcol, building.id, id), subcol === 'expenses');
  };

  const handleDeleteBuilding = async () => {
    if (!building) return;
    const deletedId = building.id;
    await deleteBuildingCascade(deletedId);
    const remaining = buildings.filter((b) => b.id !== deletedId);
    setBuildings(remaining);
    setPreferredBuildingId(remaining[0]?.id || '');
    setCurrentTab('dashboard');
  };

  if (status !== 'ready' || !currentUser || !building) {
    return (
      <div className="min-h-screen bg-film text-ink flex items-center justify-center font-sans text-sm">
        {status === 'ready' && currentUser ? (
          <div className="w-full max-w-5xl py-10 px-4 space-y-8 flex flex-col items-center">
            <AccessGate
              name={currentUser.name}
              email={currentUser.email}
              isAnonymous={authUser?.isAnonymous}
              onCreateBuilding={!authUser?.isAnonymous ? handleCreateBuilding : undefined}
              onClaimByIdentifier={handleClaimByIdentifier}
              onRecheck={handleRecheckInvites}
              onLogout={handleLogout}
            />
            {isAdmin && (
              <div className="w-full">
                <AdminView
                  currentUserId={currentUser.id}
                  onChanged={() => {
                    if (authUser) loadBuildingsForUser(authUser);
                  }}
                />
              </div>
            )}
          </div>
        ) : status === 'signedOut' ? (
          <AuthModal />
        ) : loadError ? (
          <div className="max-w-lg w-full mx-4 rounded-2xl border border-line bg-sheet p-6 space-y-4 text-xs">
            <div className="flex items-start gap-2.5 text-red">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-ink">Грешка при зареждане на данните</h2>
                <p className="text-ink leading-relaxed">{loadError}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => authUser && loadBuildingsForUser(authUser)}
                className="px-4 py-2 font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Опитай пак</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-2 text-mute hover:text-ink inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Изход от профила</span>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-mute">Зареждане…</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-film text-ink flex flex-col font-sans selection:bg-mat selection:text-ink">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={handleNavigateTab}
        currentUser={currentUser}
        setCurrentUser={() => {}}
        openAiChat={() => {
          setAiInitialPrompt(undefined);
          setIsAiModalOpen(true);
        }}
        onOpenDiagnosisModal={() => setIsCameraDiagnosisOpen(true)}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        allUsers={[currentUser]}
        buildings={buildings}
        activeBuilding={building}
        onSwitchBuilding={handleSwitchBuilding}
        onCreateBuilding={canCreateBuildings ? handleCreateBuilding : undefined}
        onClaimBuildingByIdentifier={handleClaimByIdentifier}
      />

      {saveError && (
        <div role="alert" className="bg-hi text-ink text-xs font-semibold px-4 py-2 flex items-center justify-center gap-3">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="underline">
            Затвори
          </button>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            currentUser={currentUser}
            building={building}
            payments={payments}
            repairTickets={repairTickets}
            calendarEvents={calendarEvents}
            apartments={apartments}
            onUpdateApartment={handleUpdateApartment}
            appliances={appliances}
            onNavigateTab={handleNavigateTab}
            openAiChatWithPrompt={handleOpenAiChatWithPrompt}
            onOpenNewTicketModal={() => {
              setCurrentTab('repairs');
              setIsExternalNewTicketOpen(true);
            }}
            onOpenNewEventModal={() => {
              setCurrentTab('calendar');
              setIsExternalNewEventOpen(true);
            }}
            onOpenDiagnosisModal={() => setIsCameraDiagnosisOpen(true)}
          />
        )}

        {currentTab === 'buildings' && (
          <BuildingsView
            currentUser={currentUser}
            building={building}
            apartments={apartments}
            payments={payments}
            repairTickets={repairTickets}
            onUpdateApartment={handleUpdateApartment}
            onSaveApartment={handleSaveApartment}
            onDeleteApartment={(id) => deleteRecord('apartments', id)}
            onDeleteBuilding={handleDeleteBuilding}
            onUpdateBuilding={handleUpdateBuilding}
            members={members}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onNavigateTab={handleNavigateTab}
          />
        )}

        {currentTab === 'payments' && (
          <PaymentsView
            currentUser={currentUser}
            payments={payments}
            building={building}
            apartments={apartments}
            onUpdatePayment={handleUpdatePayment}
            onCreatePayment={handleCreatePayment}
            onDeletePayment={(id) => deleteRecord('payments', id)}
            onUpdateBankDetails={currentUser.role === 'owner' ? handleUpdateBankDetails : undefined}
            highlightPaymentId={highlightItemId}
          />
        )}

        {currentTab === 'repairs' && (
          <RepairsView
            currentUser={currentUser}
            tickets={repairTickets}
            defects={defects}
            onUpdateTicket={handleUpdateTicket}
            onDeleteTicket={(id) => deleteRecord('repairTickets', id)}
            onDeleteDefect={(id) => deleteRecord('defects', id)}
            onCreateTicket={handleCreateTicket}
            onUpdateDefect={handleUpdateDefect}
            onCreateDefect={handleCreateDefect}
            highlightTicketId={highlightItemId}
            isCreateModalOpenExternal={isExternalNewTicketOpen}
            craftsmen={members.filter((m) => m.role === 'craftsman').map((m) => m.name || m.phone || m.email)}
            onCloseCreateModalExternal={() => setIsExternalNewTicketOpen(false)}
          />
        )}

        {currentTab === 'calendar' && (
          <CalendarView
            currentUser={currentUser}
            events={calendarEvents}
            onCreateEvent={handleCreateEvent}
            onUpdateEventStatus={handleUpdateEventStatus}
            highlightEventId={highlightItemId}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={(id) => deleteRecord('calendarEvents', id)}
            isCreateModalOpenExternal={isExternalNewEventOpen}
            onCloseCreateModalExternal={() => setIsExternalNewEventOpen(false)}
          />
        )}

        {currentTab === 'appliances' && (
          <AppliancesView
            currentUser={currentUser}
            appliances={appliances}
            onOpenNewTicketForAppliance={() => {
              setCurrentTab('repairs');
              setIsExternalNewTicketOpen(true);
            }}
            onAddServiceLog={handleAddApplianceServiceLog}
          />
        )}

        {currentTab === 'expenses' && (
          <ExpensesView
            currentUser={currentUser}
            expenses={expenses}
            reserveFundBalance={building.reserveFundBalance}
            onAddExpense={handleAddExpense}
            onApproveExpense={handleApproveExpense}
            onDeleteExpense={(id) => deleteRecord('expenses', id)}
            onUpdateReserveBalance={currentUser.role === 'owner' ? handleUpdateReserveBalance : undefined}
          />
        )}

        {currentTab === 'admin' && isAdmin && (
          <AdminView
            currentUserId={currentUser.id}
            onChanged={() => {
              if (authUser) loadBuildingsForUser(authUser);
            }}
          />
        )}
      </main>

      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setAiInitialPrompt(undefined);
            setIsAiModalOpen(true);
          }}
          className="flex items-center gap-2.5 px-4 py-3 bg-mat hover:bg-mat-deep text-white font-bold text-xs rounded-xl border border-mat/40 transition-transform hover:scale-105 active:scale-95"
        >
          <span className="w-2 h-2 rounded-full bg-stamp animate-pulse" />
          <span>Питай асистента</span>
        </button>
      </div>

      <AIAssistantModal
        key={currentUser.id}
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        currentUser={currentUser}
        building={building}
        payments={payments}
        repairTickets={repairTickets}
        calendarEvents={calendarEvents}
        initialPrompt={aiInitialPrompt}
        onNavigateTab={handleNavigateTab}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <CameraDiagnosisModal
        isOpen={isCameraDiagnosisOpen}
        onClose={() => setIsCameraDiagnosisOpen(false)}
        currentUser={currentUser}
        onCreateTicketFromDiagnosis={(ticket) => {
          handleCreateTicket(ticket);
          setIsCameraDiagnosisOpen(false);
          handleNavigateTab('repairs');
        }}
      />

      <footer className="border-t border-line bg-film py-6 text-xs text-mute">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-ink tracking-wider">BUILDING BRAIN</span>
            <span aria-hidden="true" className="text-mute">·</span>
            <span className="text-ink">Една сграда. Един календар. Един асистент.</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-tech text-[11px] text-ink">
              {building.name} ({building.city})
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
