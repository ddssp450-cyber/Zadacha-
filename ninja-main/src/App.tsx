/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  Building, 
  Apartment, 
  PaymentObligation, 
  RepairTicket, 
  ConstructionDefect, 
  CalendarEvent, 
  ExpenseRecord,
  Appliance 
} from './types';

import { api, ApiError, saveRecord } from './api';

export default function App() {
  // 'loading' until /api/state answers; 'signedOut' when there is no valid session
  const [status, setStatus] = useState<'loading' | 'ready' | 'signedOut'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Current user state (null until the server confirms the session)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Auth Modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Camera AI Diagnosis modal state
  const [isCameraDiagnosisOpen, setIsCameraDiagnosisOpen] = useState(false);

  // Active tab state
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [highlightItemId, setHighlightItemId] = useState<string | undefined>(undefined);

  // Main domain entities state (loaded from MySQL via /api/state)
  const [building, setBuilding] = useState<Building | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [canCreateBuildings, setCanCreateBuildings] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [payments, setPayments] = useState<PaymentObligation[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [repairTickets, setRepairTickets] = useState<RepairTicket[]>([]);
  const [defects, setDefects] = useState<ConstructionDefect[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);

  // Modals state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  const [isExternalNewTicketOpen, setIsExternalNewTicketOpen] = useState(false);
  const [isExternalNewEventOpen, setIsExternalNewEventOpen] = useState(false);

  const loadState = async () => {
    setLoadError(null);
    try {
      const s = await api('/api/state');
      setCurrentUser(s.user);
      setBuildings(s.buildings);
      setMembers(s.members);
      setCanCreateBuildings(s.canCreateBuildings);
      setIsAdmin(s.isAdmin);
      setBuilding(s.buildings.find((b: Building) => b.id === s.activeBuildingId) ?? null);
      setApartments(s.apartments);
      setPayments(s.payments);
      setAppliances(s.appliances);
      setRepairTickets(s.repairTickets);
      setDefects(s.defects);
      setCalendarEvents(s.calendarEvents);
      setExpenses(s.expenses);
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
        setStatus('signedOut');
      } else {
        setLoadError(err instanceof Error ? err.message : 'Сървърът не отговаря.');
      }
    }
  };

  useEffect(() => {
    loadState();
  }, []);

  // Optimistic UI: state is updated right away, the write goes to MySQL in the background
  const persistCall = (call: Promise<unknown>) =>
    call.catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        setCurrentUser(null);
        setStatus('signedOut');
        return;
      }
      setSaveError('Последната промяна не беше записана. Презареди страницата и опитай пак.');
    });

  const persist = (collection: string, record: { id: string }) => persistCall(saveRecord(collection, record));

  // A full reload on every account change, so nothing from the previous user stays in memory.
  const handleLoginSuccess = (_user: UserProfile) => {
    window.location.reload();
  };

  const handleLogout = () => {
    api('/api/auth/logout', 'POST').finally(() => window.location.reload());
  };

  // Tab navigation helper with optional item highlight
  const handleNavigateTab = (tab: string, highlightId?: string) => {
    setCurrentTab(tab);
    setHighlightItemId(highlightId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // AI Chat launcher with preset prompt
  const handleOpenAiChatWithPrompt = (prompt: string) => {
    setAiInitialPrompt(prompt);
    setIsAiModalOpen(true);
  };

  // Payment operations
  const handleUpdatePayment = (updated: PaymentObligation) => {
    setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    persist('payments', updated);
  };

  const handleCreatePayment = (newP: Omit<PaymentObligation, 'id'>) => {
    const created: PaymentObligation = {
      ...newP,
      id: `pay-${Date.now()}`,
    };
    setPayments((prev) => [created, ...prev]);
    persist('payments', created);
  };

  // Repair operations
  const handleUpdateTicket = (updated: RepairTicket) => {
    setRepairTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    persist('repairTickets', updated);
  };

  const handleCreateTicket = (newT: Omit<RepairTicket, 'id' | 'ticketNumber'>) => {
    const count = repairTickets.length + 1;
    const ticketNumber = `REM-${new Date().getFullYear()}-0${count < 10 ? '0' + count : count}`;
    const created: RepairTicket = {
      ...newT,
      id: `rep-${Date.now()}`,
      ticketNumber,
    };
    setRepairTickets((prev) => [created, ...prev]);
    persist('repairTickets', created);

    // Tenants can't write the calendar; the owner schedules their report.
    if (currentUser?.role === 'tenant') return;
    // Also auto-propose or create calendar entry
    const newEvent: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: `Ремонт: ${created.title}`,
      category: 'repair',
      startDateTime: `${created.deadlineDate}T10:00:00`,
      endDateTime: `${created.deadlineDate}T12:00:00`,
      buildingId: building!.id,
      apartmentNumber: created.apartmentNumber,
      assignedToName: created.assignedCraftsmanName || 'Майстор',
      assignedRole: 'craftsman',
      status: 'pending',
      description: created.description,
      priority: created.priority === 'urgent' ? 'urgent' : 'high',
    };
    setCalendarEvents((prev) => [newEvent, ...prev]);
    persist('calendarEvents', newEvent);
  };

  // Defect operations
  const handleUpdateDefect = (updated: ConstructionDefect) => {
    setDefects((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    persist('defects', updated);
  };

  const handleCreateDefect = (newD: Omit<ConstructionDefect, 'id' | 'defectNumber'>) => {
    const count = defects.length + 1;
    const created: ConstructionDefect = {
      ...newD,
      id: `def-${Date.now()}`,
      defectNumber: `DEF-${new Date().getFullYear()}-0${count < 10 ? '0' + count : count}`,
    };
    setDefects((prev) => [created, ...prev]);
    persist('defects', created);
  };

  // Calendar operations
  const handleCreateEvent = (newEventData: Omit<CalendarEvent, 'id'>) => {
    const created: CalendarEvent = {
      ...newEventData,
      id: `evt-${Date.now()}`,
    };
    setCalendarEvents((prev) => [created, ...prev]);
    persist('calendarEvents', created);
  };

  const handleUpdateEventStatus = (eventId: string, status: CalendarEvent['status']) => {
    const event = calendarEvents.find((e) => e.id === eventId);
    if (!event) return;
    const updated = { ...event, status };
    setCalendarEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));
    persist('calendarEvents', updated);
  };

  const handleUpdateEvent = (updated: CalendarEvent) => {
    setCalendarEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    persist('calendarEvents', updated);
  };

  // Apartment operations
  const handleUpdateApartment = (updated: Apartment) => {
    setApartments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    persist('apartments', updated);
  };

  // Expense operations
  const handleAddExpense = (newExp: Omit<ExpenseRecord, 'id'>) => {
    const created: ExpenseRecord = {
      ...newExp,
      id: `exp-${Date.now()}`,
    };
    setExpenses((prev) => [created, ...prev]);
    // Deduct from reserve fund balance; the server does it atomically and returns the real balance
    setBuilding((prev) => prev && { ...prev, reserveFundBalance: prev.reserveFundBalance - created.amount });
    persistCall(
      api<{ building: Building }>('/api/expenses', 'POST', created).then(({ building }) => setBuilding(building))
    );
  };

  const handleApproveExpense = (expenseId: string) => {
    const expense = expenses.find((exp) => exp.id === expenseId);
    if (!expense) return;
    const updated: ExpenseRecord = { ...expense, status: 'paid', approvedByOwner: true };
    setExpenses((prev) => prev.map((exp) => (exp.id === expenseId ? updated : exp)));
    persist('expenses', updated);
  };

  // Appliance maintenance logging
  const handleAddApplianceServiceLog = (
    applianceId: string,
    log: { date: string; technicianName: string; description: string; cost: number }
  ) => {
    const app = appliances.find((a) => a.id === applianceId);
    if (!app) return;
    const updated: Appliance = {
      ...app,
      status: 'operational',
      lastServicedAt: log.date,
      serviceHistory: [
        {
          id: `sh-${Date.now()}`,
          ...log,
        },
        ...app.serviceHistory,
      ],
    };
    setAppliances((prev) => prev.map((a) => (a.id === applianceId ? updated : a)));
    persist('appliances', updated);
  };

  // Buildings and members: the server decides who may do what, the client just reloads its view
  const handleCreateBuilding = (fields: BuildingFields) =>
    api('/api/buildings', 'POST', fields).then(() => {
      setCurrentTab('buildings');
      return loadState();
    });

  const handleUpdateBuilding = (fields: BuildingFields) => {
    if (!building) return Promise.resolve();
    const updated = { ...building, ...fields };
    return saveRecord('buildings', updated).then(() => {
      setBuilding(updated);
      setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    });
  };

  const handleSwitchBuilding = (buildingId: string) => {
    persistCall(api('/api/active-building', 'POST', { buildingId }).then(() => {
      setCurrentTab('dashboard');
      return loadState();
    }));
  };

  const handleAddMember = (m: { email: string; role: UserProfile['role']; apartmentNumber?: string }) =>
    api('/api/members', 'POST', m).then(loadState);

  const handleRemoveMember = (email: string) =>
    api(`/api/members/${encodeURIComponent(email)}`, 'DELETE').then(loadState);

  const handleSaveApartment = (apt: Apartment) => {
    setApartments((prev) => (prev.some((a) => a.id === apt.id) ? prev.map((a) => (a.id === apt.id ? apt : a)) : [...prev, apt]));
    persist('apartments', apt);
  };

  // Owner deletes: drop from the screen right away, then from the database
  const deleteRecord = (collection: string, id: string, setter: React.Dispatch<React.SetStateAction<any[]>>) => {
    setter((prev) => prev.filter((r) => r.id !== id));
    persistCall(
      api<{ building: Building | null }>(`/api/data/${collection}/${encodeURIComponent(id)}`, 'DELETE').then(
        // Deleting an expense returns its money to the reserve fund
        (r) => r.building && setBuilding(r.building)
      )
    );
  };

  const handleDeleteBuilding = () =>
    api(`/api/buildings/${encodeURIComponent(building!.id)}`, 'DELETE').then(() => {
      setCurrentTab('dashboard');
      return loadState();
    });

  // Reset demo data helper (owner only; the server enforces it too)
  const handleResetData = () => {
    persistCall(api('/api/reset', 'POST').then(loadState));
  };

  if (status !== 'ready' || !currentUser || !building) {
    return (
      <div className="min-h-screen bg-film text-ink flex items-center justify-center font-sans text-sm">
        {status === 'ready' && currentUser ? (
          <div className="w-full max-w-5xl py-10 px-4 space-y-8 flex flex-col items-center">
            <AccessGate
              email={currentUser.email}
              onCreateBuilding={canCreateBuildings ? handleCreateBuilding : undefined}
              onRecheck={loadState}
              onLogout={handleLogout}
            />
            {/* An admin without a building of their own still gets the panel */}
            {isAdmin && <div className="w-full"><AdminView currentUserId={currentUser.id} /></div>}
          </div>
        ) : status === 'signedOut' ? (
          <AuthModal onLoginSuccess={handleLoginSuccess} />
        ) : loadError ? (
          <div className="text-center space-y-3">
            <p>{loadError}</p>
            <button onClick={loadState} className="text-mat hover:text-ink font-semibold">
              Опитай пак
            </button>
          </div>
        ) : (
          <p className="text-mute">Зареждане…</p>
        )}
      </div>
    );
  }

  const effectiveUser: UserProfile = currentUser;

  return (
    <div className="min-h-screen bg-film text-ink flex flex-col font-sans selection:bg-mat selection:text-ink">
      {/* Top Bar Contract (Wordmark - Navigation Links - Role Switcher) */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={handleNavigateTab}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        openAiChat={() => {
          setAiInitialPrompt(undefined);
          setIsAiModalOpen(true);
        }}
        onOpenDiagnosisModal={() => setIsCameraDiagnosisOpen(true)}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        // Switching to another account requires signing in as it, so the switcher only lists the current one
        allUsers={[currentUser]}
        buildings={buildings}
        activeBuilding={building}
        onSwitchBuilding={handleSwitchBuilding}
        onCreateBuilding={canCreateBuildings ? handleCreateBuilding : undefined}
      />

      {saveError && (
        <div role="alert" className="bg-hi text-ink text-xs font-semibold px-4 py-2 flex items-center justify-center gap-3">
          <span>{saveError}</span>
          <button onClick={() => window.location.reload()} className="underline">
            Презареди
          </button>
        </div>
      )}

      {/* Main Viewport Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            currentUser={effectiveUser}
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
            currentUser={effectiveUser}
            building={building}
            apartments={apartments}
            payments={payments}
            repairTickets={repairTickets}
            onUpdateApartment={handleUpdateApartment}
            onSaveApartment={handleSaveApartment}
            onDeleteApartment={(id) => deleteRecord('apartments', id, setApartments)}
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
            currentUser={effectiveUser}
            payments={payments}
            building={building}
            apartments={apartments}
            onUpdatePayment={handleUpdatePayment}
            onCreatePayment={handleCreatePayment}
            onDeletePayment={(id) => deleteRecord('payments', id, setPayments)}
            highlightPaymentId={highlightItemId}
          />
        )}

        {currentTab === 'repairs' && (
          <RepairsView
            currentUser={effectiveUser}
            tickets={repairTickets}
            defects={defects}
            onUpdateTicket={handleUpdateTicket}
            onDeleteTicket={(id) => deleteRecord('repairTickets', id, setRepairTickets)}
            onDeleteDefect={(id) => deleteRecord('defects', id, setDefects)}
            onCreateTicket={handleCreateTicket}
            onUpdateDefect={handleUpdateDefect}
            onCreateDefect={handleCreateDefect}
            highlightTicketId={highlightItemId}
            isCreateModalOpenExternal={isExternalNewTicketOpen}
            craftsmen={members.filter((m) => m.role === 'craftsman').map((m) => m.name || m.email)}
            onCloseCreateModalExternal={() => setIsExternalNewTicketOpen(false)}
          />
        )}

        {currentTab === 'calendar' && (
          <CalendarView
            currentUser={effectiveUser}
            events={calendarEvents}
            onCreateEvent={handleCreateEvent}
            onUpdateEventStatus={handleUpdateEventStatus}
            highlightEventId={highlightItemId}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={(id) => deleteRecord('calendarEvents', id, setCalendarEvents)}
            isCreateModalOpenExternal={isExternalNewEventOpen}
            onCloseCreateModalExternal={() => setIsExternalNewEventOpen(false)}
          />
        )}

        {currentTab === 'appliances' && (
          <AppliancesView
            currentUser={effectiveUser}
            appliances={appliances}
            onOpenNewTicketForAppliance={(app) => {
              setCurrentTab('repairs');
              setIsExternalNewTicketOpen(true);
            }}
            onAddServiceLog={handleAddApplianceServiceLog}
          />
        )}

        {currentTab === 'expenses' && (
          <ExpensesView
            currentUser={effectiveUser}
            expenses={expenses}
            reserveFundBalance={building.reserveFundBalance}
            onAddExpense={handleAddExpense}
            onApproveExpense={handleApproveExpense}
            onDeleteExpense={(id) => deleteRecord('expenses', id, setExpenses)}
          />
        )}

        {currentTab === 'admin' && isAdmin && <AdminView currentUserId={currentUser.id} onChanged={loadState} />}
      </main>

      {/* Floating AI Assistant Trigger with Sofia Blue Details and Sage Greenish indicator */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setAiInitialPrompt(undefined);
            setIsAiModalOpen(true);
          }}
          className="flex items-center gap-2.5 px-4 py-3 bg-mat hover:bg-mat-deep text-white font-bold text-xs rounded-xl  border border-mat/40 transition-transform hover:scale-105 active:scale-95"
        >
          <span className="w-2 h-2 rounded-full bg-stamp animate-pulse" />
          <span>Питай асистента</span>
        </button>
      </div>

      {/* Dedicated AI Chatbot Modal */}
      <AIAssistantModal
        key={effectiveUser.id}
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        currentUser={effectiveUser}
        building={building}
        payments={payments}
        repairTickets={repairTickets}
        calendarEvents={calendarEvents}
        initialPrompt={aiInitialPrompt}
        onNavigateTab={handleNavigateTab}
      />

      {/* User Login & Registration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Phone Camera & AI Damage Diagnosis Modal */}
      <CameraDiagnosisModal
        isOpen={isCameraDiagnosisOpen}
        onClose={() => setIsCameraDiagnosisOpen(false)}
        currentUser={effectiveUser}
        onCreateTicketFromDiagnosis={(ticket) => {
          handleCreateTicket(ticket);
          setIsCameraDiagnosisOpen(false);
          handleNavigateTab('repairs');
        }}
      />

      {/* Clean Editorial Footer - Black, Beige & Blue details */}
      <footer className="border-t border-line bg-film py-6 text-xs text-mute">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-ink tracking-wider">
              BUILDING BRAIN
            </span>
            <span aria-hidden="true" className="text-mute">·</span>
            <span className="text-ink">Една сграда. Един календар. Един асистент.</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-tech text-[11px] text-ink">
              {building.name} ({building.city})
            </span>
            {currentUser.role === 'owner' && (
              <>
                <span aria-hidden="true" className="text-mute">·</span>
                <button
                  onClick={handleResetData}
                  className="text-mat hover:text-ink transition-colors text-[11px]"
                  title="Възстанови началните демо данни"
                >
                  Възстанови демо данни
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
