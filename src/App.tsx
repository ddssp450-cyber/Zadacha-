/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, User as FirebaseUser } from 'firebase/auth';
import { Mail, RefreshCw } from 'lucide-react';
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

import { ADMIN_EMAIL, auth } from './lib/firebase';
import {
  BuildingMeta,
  InviteRecord,
  MemberRecord,
  addBuildingMember,
  addExpenseAtomic,
  claimInvitesByIdentifier,
  claimPendingInvites,
  confirmPaymentAtomic,
  createBuildingInFirestore,
  deleteBuildingCascade,
  deleteExpenseAtomic,
  deleteSubdoc,
  ensureUserDoc,
  makeId,
  removeBuildingMember,
  saveSubdoc,
  subscribeBuildingData,
  subscribeUserBuildings,
  syncOwnerAclsIfNeeded,
  updateActiveBuilding,
  updateBuildingDetails,
  updateSubdocFields,
} from './lib/firestoreStore';

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
  const [status, setStatus] = useState<'loading' | 'ready' | 'signedOut' | 'needsVerification'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [verifyFeedback, setVerifyFeedback] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfileBase, setUserProfileBase] = useState<{ name: string; phone: string; avatarUrl: string; activeBuildingId?: string } | null>(null);
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

  const bootstrapVerifiedUser = async (
    fbUser: FirebaseUser,
    setUnsubBuildings: (fn: () => void) => void
  ) => {
    setStatus('loading');
    setLoadError(null);

    let pendingPhone = '';
    try {
      pendingPhone = sessionStorage.getItem('bb_pending_phone') || '';
    } catch {
      // Ignore storage access errors
    }

    try {
      const uDoc = await ensureUserDoc(fbUser, pendingPhone ? { phone: pendingPhone } : undefined);
      if (pendingPhone) {
        try {
          sessionStorage.removeItem('bb_pending_phone');
        } catch {
          // Ignore
        }
      }

      const claimedId = await claimPendingInvites(fbUser);
      setUserProfileBase({
        name: uDoc.name,
        phone: uDoc.phone,
        avatarUrl: uDoc.avatarUrl,
        activeBuildingId: claimedId || uDoc.activeBuildingId,
      });
      if (claimedId || uDoc.activeBuildingId) {
        setPreferredBuildingId(claimedId || uDoc.activeBuildingId || '');
      }

      const unsub = subscribeUserBuildings(fbUser.uid, (list) => {
        setBuildings(list);
        setStatus('ready');
      });
      setUnsubBuildings(unsub);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Грешка при свързване с базата данни.');
      setStatus('ready');
    }
  };

  // Watch Firebase Auth state & subscribe to user's buildings
  useEffect(() => {
    let unsubBuildings: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubBuildings) {
        unsubBuildings();
        unsubBuildings = null;
      }

      if (!fbUser) {
        setFirebaseUser(null);
        setUserProfileBase(null);
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
        setStatus('signedOut');
        return;
      }

      setFirebaseUser(fbUser);

      // Email/Password users must verify their email before creating buildings or reading email invites
      if (!fbUser.isAnonymous && !fbUser.emailVerified) {
        setVerifyFeedback(null);
        setStatus('needsVerification');
        return;
      }

      await bootstrapVerifiedUser(fbUser, (fn) => {
        unsubBuildings = fn;
      });
    });

    return () => {
      unsubAuth();
      if (unsubBuildings) unsubBuildings();
    };
  }, []);

  const isAdmin = Boolean(
    firebaseUser &&
      !firebaseUser.isAnonymous &&
      firebaseUser.emailVerified &&
      firebaseUser.email &&
      firebaseUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  const building = useMemo<BuildingMeta | null>(() => {
    if (buildings.length === 0) return null;
    return buildings.find((b) => b.id === preferredBuildingId) || buildings[0];
  }, [buildings, preferredBuildingId]);

  // Subscribe to subcollections of the active building
  useEffect(() => {
    if (!firebaseUser || !building || status !== 'ready') {
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

    return subscribeBuildingData(building, firebaseUser.uid, isAdmin, {
      onMembers: setMembersRaw,
      onInvites: setInvitesRaw,
      onApartments: (list) => setApartments([...list].sort((a, b) => Number(a.number) - Number(b.number))),
      onPayments: setPayments,
      onAppliances: setAppliances,
      onRepairTickets: setRepairTickets,
      onDefects: setDefects,
      onCalendarEvents: setCalendarEvents,
      onExpenses: setExpenses,
    });
  }, [firebaseUser?.uid, building?.id, isAdmin, status]);

  // Keep owner subcollection ACLs aligned if a member created a ticket/defect/event
  useEffect(() => {
    if (!firebaseUser || !building || building.ownerId !== firebaseUser.uid) return;
    if (membersRaw.length === 0 && invitesRaw.length === 0) return;

    const timer = setTimeout(() => {
      syncOwnerAclsIfNeeded(building, membersRaw, invitesRaw, 'repairTickets', repairTickets).catch(() => {});
      syncOwnerAclsIfNeeded(building, membersRaw, invitesRaw, 'defects', defects).catch(() => {});
      syncOwnerAclsIfNeeded(building, membersRaw, invitesRaw, 'calendarEvents', calendarEvents).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [building?.id, firebaseUser?.uid, membersRaw, invitesRaw, repairTickets, defects, calendarEvents]);

  const currentUser = useMemo<UserProfile | null>(() => {
    if (!firebaseUser || !userProfileBase) return null;
    const myMember = membersRaw.find((m) => m.uid === firebaseUser.uid);
    const role: UserRole =
      building && building.ownerId === firebaseUser.uid
        ? 'owner'
        : myMember?.role || (firebaseUser.isAnonymous ? 'tenant' : 'owner');
    const apartmentNumber = myMember?.apartmentNumber || undefined;

    let roleTitle = 'Собственик & Управител на Етажна Собственост';
    if (role === 'tenant') roleTitle = apartmentNumber ? `Наемател — Апартамент ${apartmentNumber}` : 'Наемател';
    else if (role === 'builder') roleTitle = 'Строителен ръководител / Инспектор';
    else if (role === 'craftsman') roleTitle = 'Техник / Майстор';

    return {
      id: firebaseUser.uid,
      name: userProfileBase.name || firebaseUser.displayName || firebaseUser.email || 'Потребител',
      email: firebaseUser.isAnonymous ? '' : (firebaseUser.email || ''),
      phone: userProfileBase.phone || '',
      role,
      roleTitle,
      apartmentNumber,
      buildingId: building?.id || '',
      avatarUrl: userProfileBase.avatarUrl || firebaseUser.photoURL || '',
    };
  }, [firebaseUser, userProfileBase, building, membersRaw]);

  // Deduplicate active members + invites by inviteId so multi-device claims don't create duplicate rows
  const members = useMemo<Member[]>(() => {
    const result: Member[] = [];
    const consumedMemberUids = new Set<string>();

    // Owner and non-invite direct members
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

    // Invites (either waiting or already claimed by one or more UIDs)
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

    // Any remaining members whose invite was deleted or not returned
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
    Boolean(firebaseUser && !firebaseUser.isAnonymous) &&
    (!building || currentUser?.role === 'owner' || isAdmin);

  const persistCall = (call: Promise<unknown>) =>
    call.catch((err) => {
      console.error(err);
      setSaveError('Последната промяна не беше записана. Провери връзката или правата си и опитай пак.');
    });

  const handleLogout = () => {
    signOut(auth).catch((err) => console.error(err));
  };

  const handleRecheckInvites = async () => {
    if (!firebaseUser) return;
    try {
      const claimed = await claimPendingInvites(firebaseUser);
      if (claimed) {
        setPreferredBuildingId(claimed);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Грешка при проверка на покани.');
    }
  };

  const handleClaimByIdentifier = async (identifier: string): Promise<number> => {
    if (!firebaseUser) return 0;
    const { claimedBuildingIds } = await claimInvitesByIdentifier(firebaseUser, identifier);
    if (claimedBuildingIds.length > 0) {
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
    if (reserveIncrement > 0) {
      persistCall(confirmPaymentAtomic(building, updated.id, patch, reserveIncrement));
    } else {
      persistCall(updateSubdocFields('payments', building.id, updated.id, patch));
    }
  };

  const handleCreatePayment = (newP: Omit<PaymentObligation, 'id'>) => {
    if (!building || !firebaseUser) return;
    const created: PaymentObligation = {
      ...newP,
      buildingId: building.id,
      id: makeId('pay'),
    };
    setPayments((list) => [created, ...list]);
    persistCall(saveSubdoc('payments', created, building, membersRaw, invitesRaw, firebaseUser.uid, true));
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
    if (!building || !firebaseUser) return;
    const count = repairTickets.length + 1;
    const ticketNumber = `REM-${new Date().getFullYear()}-0${count < 10 ? '0' + count : count}`;
    const created: RepairTicket = {
      ...newT,
      buildingId: building.id,
      id: makeId('rep'),
      ticketNumber,
    };
    setRepairTickets((list) => [created, ...list]);
    persistCall(saveSubdoc('repairTickets', created, building, membersRaw, invitesRaw, firebaseUser.uid, true));

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
    persistCall(saveSubdoc('calendarEvents', newEvent, building, membersRaw, invitesRaw, firebaseUser.uid, true));
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
    if (!building || !firebaseUser) return;
    const count = defects.length + 1;
    const created: ConstructionDefect = {
      ...newD,
      buildingId: building.id,
      id: makeId('def'),
      defectNumber: `DEF-${new Date().getFullYear()}-0${count < 10 ? '0' + count : count}`,
    };
    setDefects((list) => [created, ...list]);
    persistCall(saveSubdoc('defects', created, building, membersRaw, invitesRaw, firebaseUser.uid, true));
  };

  // Calendar operations
  const handleCreateEvent = (newEventData: Omit<CalendarEvent, 'id'>) => {
    if (!building || !firebaseUser) return;
    const created: CalendarEvent = {
      ...newEventData,
      buildingId: building.id,
      id: makeId('evt'),
    };
    setCalendarEvents((list) => [created, ...list]);
    persistCall(saveSubdoc('calendarEvents', created, building, membersRaw, invitesRaw, firebaseUser.uid, true));
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
    if (!building || !firebaseUser) return;
    const existing = apartments.find((a) => a.id === apt.id);
    const normalized: Apartment = { ...apt, buildingId: building.id };
    if (existing) {
      handleUpdateApartment(normalized);
    } else {
      setApartments((list) => [...list, normalized]);
      persistCall(saveSubdoc('apartments', normalized, building, membersRaw, invitesRaw, firebaseUser.uid, true));
    }
  };

  // Expense operations (atomic balance adjustment)
  const handleAddExpense = (newExp: Omit<ExpenseRecord, 'id'>) => {
    if (!building || !firebaseUser) return;
    persistCall(addExpenseAtomic(newExp, building, firebaseUser.uid));
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
    if (!firebaseUser) return;
    const newId = await createBuildingInFirestore(firebaseUser, fields);
    setPreferredBuildingId(newId);
    setCurrentTab('buildings');
  };

  const handleUpdateBuilding = async (fields: BuildingFields) => {
    if (!building) return;
    await updateBuildingDetails(building, fields);
  };

  const handleUpdateBankDetails = async (fields: { iban: string; bankName: string; contactManager: string }) => {
    if (!building) return;
    await updateBuildingDetails(building, fields);
  };

  const handleUpdateReserveBalance = async (newBalance: number) => {
    if (!building) return;
    await updateBuildingDetails(building, { reserveFundBalance: newBalance });
  };

  const handleSwitchBuilding = (buildingId: string) => {
    setPreferredBuildingId(buildingId);
    setCurrentTab('dashboard');
    if (firebaseUser) {
      persistCall(updateActiveBuilding(firebaseUser.uid, buildingId));
    }
  };

  const handleAddMember = (m: { name?: string; phone?: string; email?: string; role: UserProfile['role']; apartmentNumber?: string }) => {
    if (!building) return Promise.resolve();
    return addBuildingMember(building, membersRaw, invitesRaw, m);
  };

  const handleRemoveMember = (member: Member) => {
    if (!building) return Promise.resolve();
    return removeBuildingMember(building, member, invitesRaw);
  };

  const deleteRecord = (subcol: string, id: string) => {
    if (!building) return;
    if (subcol === 'expenses') {
      const exp = expenses.find((e) => e.id === id);
      if (exp) persistCall(deleteExpenseAtomic(exp, building));
      return;
    }
    persistCall(deleteSubdoc(subcol, building.id, id));
  };

  const handleDeleteBuilding = async () => {
    if (!building) return;
    await deleteBuildingCascade(building.id);
    setPreferredBuildingId('');
    setCurrentTab('dashboard');
  };

  if (status === 'needsVerification' && firebaseUser) {
    return (
      <div className="min-h-screen bg-film text-ink flex items-center justify-center font-sans text-sm px-4">
        <div className="max-w-md w-full rounded-2xl border border-line bg-sheet p-6 space-y-4 text-xs">
          <div className="flex items-center gap-2 text-base font-bold text-ink">
            <Mail className="w-5 h-5 text-mat" />
            <span>Потвърди своя имейл адрес</span>
          </div>
          <p className="text-ink leading-relaxed">
            Изпратихме линк за потвърждение на <b>{firebaseUser.email}</b>. Отвори пощата си, кликни върху линка и след това натисни бутона по-долу.
          </p>
          {verifyFeedback && (
            <p className="p-2.5 rounded-lg bg-raise border border-rule text-ink">{verifyFeedback}</p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={verifyBusy}
              onClick={async () => {
                setVerifyBusy(true);
                setVerifyFeedback(null);
                try {
                  await firebaseUser.reload();
                  const refreshed = auth.currentUser;
                  if (refreshed?.emailVerified) {
                    await refreshed.getIdToken(true);
                    window.location.reload();
                  } else {
                    setVerifyFeedback('Имейлът все още не е потвърден. Провери входящата поща и папка Спам.');
                  }
                } catch (err) {
                  setVerifyFeedback(err instanceof Error ? err.message : 'Грешка при проверка.');
                } finally {
                  setVerifyBusy(false);
                }
              }}
              className="px-4 py-2 font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{verifyBusy ? 'Проверка…' : 'Потвърдих имейла — продължи'}</span>
            </button>
            <button
              type="button"
              disabled={verifyBusy}
              onClick={async () => {
                setVerifyBusy(true);
                setVerifyFeedback(null);
                try {
                  await sendEmailVerification(firebaseUser);
                  setVerifyFeedback('Изпратихме нов линк за потвърждение.');
                } catch (err) {
                  setVerifyFeedback(err instanceof Error ? err.message : 'Изчакай малко преди ново изпращане.');
                } finally {
                  setVerifyBusy(false);
                }
              }}
              className="px-3 py-2 text-mat hover:text-ink font-medium"
            >
              Изпрати линка отново
            </button>
          </div>
          <div className="pt-2 border-t border-line">
            <button onClick={handleLogout} className="text-mute hover:text-ink">
              Изход от профила
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'ready' || !currentUser || !building) {
    return (
      <div className="min-h-screen bg-film text-ink flex items-center justify-center font-sans text-sm">
        {status === 'ready' && currentUser ? (
          <div className="w-full max-w-5xl py-10 px-4 space-y-8 flex flex-col items-center">
            <AccessGate
              name={currentUser.name}
              email={currentUser.email}
              isAnonymous={firebaseUser?.isAnonymous}
              onCreateBuilding={!firebaseUser?.isAnonymous ? handleCreateBuilding : undefined}
              onClaimByIdentifier={handleClaimByIdentifier}
              onRecheck={handleRecheckInvites}
              onLogout={handleLogout}
            />
            {isAdmin && <div className="w-full"><AdminView currentUserId={currentUser.id} /></div>}
          </div>
        ) : status === 'signedOut' ? (
          <AuthModal />
        ) : loadError ? (
          <div className="text-center space-y-3 p-6">
            <p>{loadError}</p>
            <button onClick={() => window.location.reload()} className="text-mat hover:text-ink font-semibold">
              Опитай пак
            </button>
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

        {currentTab === 'admin' && isAdmin && <AdminView currentUserId={currentUser.id} />}
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
