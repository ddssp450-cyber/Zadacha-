import React, { useEffect, useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Sparkles, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Filter, 
  MapPin, 
  User, 
  X,
  Check,
  CalendarDays,
  List,
  Columns
} from 'lucide-react';
import { CalendarEvent, EventCategory, UserRole, UserProfile } from '../types';
import { DeleteButton } from './PhotoPicker';
import { getAuthHeaders } from '../lib/apiClient';

interface CalendarViewProps {
  currentUser: UserProfile;
  events: CalendarEvent[];
  onCreateEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onUpdateEventStatus: (eventId: string, status: CalendarEvent['status']) => void;
  onUpdateEvent: (event: CalendarEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
  highlightEventId?: string;
  isCreateModalOpenExternal?: boolean;
  onCloseCreateModalExternal?: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  currentUser,
  events,
  onCreateEvent,
  onUpdateEventStatus,
  onUpdateEvent,
  onDeleteEvent,
  highlightEventId,
  isCreateModalOpenExternal,
  onCloseCreateModalExternal,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);

  // Natural Language AI Command Bar State
  const [aiCommandInput, setAiCommandInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiProposal, setAiProposal] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // New Event Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EventCategory>('inspection');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newTime, setNewTime] = useState('10:00');
  const [newApartment, setNewApartment] = useState('Общи части');
  const [newAssignedRole, setNewAssignedRole] = useState<UserRole | 'all'>('all');
  const [newAssignedName, setNewAssignedName] = useState('Домоуправител');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<'urgent' | 'high' | 'normal'>('normal');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Opens the form empty for a new event, or filled in to change an existing one.
  const openEventForm = (evt?: CalendarEvent) => {
    setEditingEvent(evt ?? null);
    setNewTitle(evt?.title ?? '');
    setNewCategory(evt?.category ?? 'inspection');
    setNewDate(evt?.startDateTime?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
    setNewTime(evt?.startDateTime?.slice(11, 16) ?? '10:00');
    setNewApartment(evt?.apartmentNumber ?? 'Общи части');
    setNewAssignedRole(evt?.assignedRole ?? 'all');
    setNewAssignedName(evt?.assignedToName ?? 'Домоуправител');
    setNewDescription(evt?.description ?? '');
    setNewPriority(evt?.priority ?? 'normal');
    setIsNewEventModalOpen(true);
  };

  const closeEventForm = () => {
    setIsNewEventModalOpen(false);
    onCloseCreateModalExternal?.();
  };

  useEffect(() => {
    if (isCreateModalOpenExternal) openEventForm();
  }, [isCreateModalOpenExternal]);

  // Filter events
  const filteredEvents = events.filter((evt) => {
    if (categoryFilter !== 'all' && evt.category !== categoryFilter) return false;
    // Role filter: if tenant, only see public/all or their events
    if (currentUser.role === 'tenant' && evt.assignedRole !== 'all' && evt.assignedRole !== 'tenant' && evt.apartmentNumber !== currentUser.apartmentNumber) {
      return false;
    }
    return true;
  });

  const getCategoryBadge = (cat: EventCategory) => {
    switch (cat) {
      case 'rent_deadline': return { label: 'Наем / Сметка', color: 'bg-stamp/10 text-stamp border-stamp/20' };
      case 'repair': return { label: 'Ремонт', color: 'bg-hi/10 text-ochre border-ochre/20' };
      case 'construction': return { label: 'Строителство', color: 'bg-mat/10 text-mat border-mat/20' };
      case 'inspection': return { label: 'Оглед', color: 'bg-stamp/10 text-stamp border-stamp/20' };
      case 'maintenance': return { label: 'Профилактика', color: 'bg-mat/10 text-mat border-mat/20' };
      case 'cleaning': return { label: 'Почистване', color: 'bg-red/10 text-red border-red/20' };
      case 'meeting': return { label: 'Общо събрание', color: 'bg-mat/10 text-mat border-mat/20' };
      // Unknown values (old rows, AI output) must not crash the page
      default: return { label: String(cat ?? '—'), color: 'text-ink bg-sheet border-line' };
    }
  };

  // AI Command submission
  const handleExecuteAiCommand = async () => {
    if (!aiCommandInput.trim()) return;
    setIsAiProcessing(true);
    setAiProposal(null);
    setAiError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/ai/parse-calendar-command', {
        method: 'POST',
        headers,
        body: JSON.stringify({ command: aiCommandInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.proposal) {
        setAiProposal(data.proposal);
      } else {
        setAiError(data?.error || 'AI не успя да разчете командата.');
      }
    } catch (err) {
      console.error(err);
      setAiError('Няма връзка със сървъра. Пробвай пак.');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleConfirmAiProposal = () => {
    if (!aiProposal) return;

    onCreateEvent({
      title: aiProposal.title,
      category: aiProposal.category,
      startDateTime: `${aiProposal.date}T${aiProposal.time}:00`,
      endDateTime: `${aiProposal.date}T18:00:00`,
      buildingId: currentUser.buildingId,
      apartmentNumber: aiProposal.apartment,
      assignedToName: ({ craftsman: 'Майстор', builder: 'Строител', owner: 'Собственик', tenant: 'Наемател' } as Record<string, string>)[aiProposal.assignedRole] ?? 'Всички',
      assignedRole: aiProposal.assignedRole,
      status: 'pending',
      description: aiProposal.description,
      priority: 'high',
    });

    setAiProposal(null);
    setAiCommandInput('');
  };

  // Month grid for the month being viewed
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 9 for October
  const monthName = currentDate.toLocaleDateString('bg-BG', { month: 'long', year: 'numeric' });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const getEventsForDay = (day: number) => {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const datePrefix = `${year}-${month + 1 < 10 ? '0' + (month + 1) : month + 1}-${dayStr}`;
    return filteredEvents.filter((e) => e.startDateTime?.startsWith(datePrefix));
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            Календар
          </h2>
          <p className="text-xs text-mute mt-0.5">
            Срокове за наеми, ремонти, огледи и профилактики — всичко на една стена
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-sheet border border-line rounded-lg text-xs">
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'month' ? 'bg-mat-soft text-mat font-medium border border-mat/60 shadow-sm' : 'text-ink hover:text-ink'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Месец</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'week' ? 'bg-mat-soft text-mat font-medium border border-mat/60 shadow-sm' : 'text-ink hover:text-ink'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Седмица</span>
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                viewMode === 'agenda' ? 'bg-mat-soft text-mat font-medium border border-mat/60 shadow-sm' : 'text-ink hover:text-ink'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Списък</span>
            </button>
          </div>

          <button
            onClick={() => openEventForm()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 text-stamp" />
            <span>Ново събитие</span>
          </button>
        </div>
      </div>

      {/* 2. Natural Language AI Scheduler Command Bar */}
      <div className="p-4 rounded-2xl bg-sheet border border-line space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-stamp">
          <Sparkles className="w-4 h-4 text-stamp" />
          <span>Кажи го с думи и асистентът ще го запише:</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Напр.: „Планирай ремонт на апартамент 5 за следващата седмица“ или „График за профилактика на климатици“"
            value={aiCommandInput}
            onChange={(e) => setAiCommandInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExecuteAiCommand()}
            className="flex-1 px-3.5 py-2.5 bg-film border border-line rounded-xl text-xs text-ink placeholder-[#787163] focus:outline-none focus:border-mat font-sans"
          />
          <button
            onClick={handleExecuteAiCommand}
            disabled={isAiProcessing || !aiCommandInput.trim()}
            className="px-4 py-2.5 bg-stamp-soft hover:bg-stamp-soft text-ink font-medium text-xs rounded-xl border border-stamp/50 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAiProcessing ? 'animate-spin' : ''}`} />
            <span>{isAiProcessing ? 'Анализиране...' : 'Планирай с AI'}</span>
          </button>
        </div>

        {aiError && (
          <p role="alert" className="text-xs text-red bg-red-soft border border-red/30 rounded-lg px-3 py-2">
            {aiError}
          </p>
        )}

        {/* AI Proposal Card with Conflict check & Confirmation */}
        {aiProposal && (
          <div className="p-4 rounded-xl bg-mat/40 border border-mat/40 text-xs space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-stamp" />
                <span className="font-bold text-ink text-sm">
                  {aiProposal.title}
                </span>
              </div>
              <span className="text-[11px] text-mat font-tech">
                {aiProposal.hasConflict ? '⚠️ Открит конфликт' : '✅ Свободен интервал'}
              </span>
            </div>

            <p className="text-ink">
              {aiProposal.description}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-film p-2.5 rounded-lg border border-line font-tech">
              <div>
                <span className="text-mute block">Дата:</span>
                <span className="text-ink font-bold">{aiProposal.date}</span>
              </div>
              <div>
                <span className="text-mute block">Начален час:</span>
                <span className="text-ink font-bold">{aiProposal.time} ч.</span>
              </div>
              <div>
                <span className="text-mute block">Локация:</span>
                <span className="text-ink font-bold">{aiProposal.apartment}</span>
              </div>
              <div>
                <span className="text-mute block">Роля:</span>
                <span className="text-ink font-bold">{aiProposal.assignedRole}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={() => setAiProposal(null)}
                className="px-3 py-1.5 text-xs text-ink hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={handleConfirmAiProposal}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-3.5 h-3.5 text-stamp" />
                <span>Потвърди и запиши в календара</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Category Filter Strip */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs">
        {[
          { id: 'all', label: 'Всички събития' },
          { id: 'rent_deadline', label: 'Наеми и сметки' },
          { id: 'repair', label: 'Ремонти' },
          { id: 'construction', label: 'Строителни дейности' },
          { id: 'inspection', label: 'Огледи' },
          { id: 'maintenance', label: 'Профилактика' },
          { id: 'cleaning', label: 'Почистване' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setCategoryFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
              categoryFilter === tab.id
                ? 'bg-mat-soft text-mat font-semibold border border-mat/60 shadow-sm'
                : 'text-ink hover:text-ink bg-sheet border border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Month View Grid */}
      {viewMode === 'month' && (
        <div className="rounded-2xl border border-line bg-sheet overflow-hidden ">
          {/* Month Navigation */}
          <div className="flex items-center justify-between p-4 border-b border-line">
            <h3 className="text-base font-bold text-ink capitalize">
              {monthName}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                className="p-1.5 rounded-lg bg-raise hover:bg-rule text-ink"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-2.5 py-1 text-xs rounded-lg bg-raise hover:bg-rule text-ink font-medium"
              >
                Днес
              </button>
              <button
                onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                className="p-1.5 rounded-lg bg-raise hover:bg-rule text-ink"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-line bg-raise text-center text-[11px] font-semibold text-mute py-2">
            <div>Пон</div>
            <div>Вт</div>
            <div>Ср</div>
            <div>Четв</div>
            <div>Пет</div>
            <div className="text-mute">Съб</div>
            <div className="text-mute">Нед</div>
          </div>

          {/* 7-column Calendar Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-line/60 bg-sheet">
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return (
                  <div key={`empty-${idx}`} className="min-h-[110px] bg-raise p-2" />
                );
              }

              const dayEvents = getEventsForDay(day);
              const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

              return (
                <div
                  key={`day-${day}`}
                  className={`min-h-[110px] p-2 transition-colors hover:bg-raise/30 ${
                    isToday ? 'bg-hi/15' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-tech font-semibold ${
                        isToday
                          ? 'w-6 h-6 rounded-full bg-hi text-ink flex items-center justify-center font-bold'
                          : 'text-mute'
                      }`}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-tech text-mute">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1">
                    {dayEvents.map((evt) => {
                      const badge = getCategoryBadge(evt.category);
                      const isHighlighted = evt.id === highlightEventId;

                      return (
                        <div
                          key={evt.id}
                          className={`p-1.5 rounded-md border text-[10px] font-medium leading-tight truncate cursor-pointer transition-transform hover:scale-[1.02] ${badge.color} ${
                            isHighlighted ? 'ring-1 ring-ochre font-bold' : ''
                          }`}
                          title={`${evt.title} (${evt.description})`}
                          onClick={() => openEventForm(evt)}
                        >
                          <div className="truncate font-semibold text-ink">
                            {evt.title}
                          </div>
                          <div className="text-[9px] text-mute truncate mt-0.5">
                            {evt.assignedToName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Agenda / List View */}
      {(viewMode === 'agenda' || viewMode === 'week') && (
        <div className="rounded-2xl border border-line bg-sheet p-5 space-y-3">
          <h3 className="text-sm font-bold text-ink mb-2">
            Хронологичен списък на събитията ({filteredEvents.length})
          </h3>

          <div className="divide-y divide-line">
            {filteredEvents.map((evt) => {
              const badge = getCategoryBadge(evt.category);
              const dateObj = new Date(evt.startDateTime);
              const formattedDate = dateObj.toLocaleDateString('bg-BG', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              const formattedTime = dateObj.toLocaleTimeString('bg-BG', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={evt.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-raise border border-rule flex flex-col items-center justify-center text-center shrink-0">
                      <span className="text-sm font-bold font-tech text-ink leading-none">
                        {dateObj.getDate()}
                      </span>
                      <span className="text-[10px] text-mute uppercase leading-none mt-1">
                        {dateObj.toLocaleDateString('bg-BG', { month: 'short' })}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-tech ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-mute font-tech text-[11px]">
                          {formattedTime !== '00:00' ? formattedTime + ' ч.' : 'През целия ден'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-ink">
                        {evt.title}
                      </div>
                      <div className="text-mute text-[11px] mt-0.5">
                        {evt.description}
                      </div>
                      <div className="text-mute text-[11px] mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-mute" />
                          <span>{evt.assignedToName}</span>
                        </span>
                        {evt.apartmentNumber && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-mute" />
                            <span>Ап. {evt.apartmentNumber}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => openEventForm(evt)}
                      className="px-2.5 py-1 text-xs text-ink bg-raise hover:bg-rule rounded-lg border border-rule transition-colors"
                    >
                      Редактирай
                    </button>
                    {evt.status === 'completed' ? (
                      <span className="text-stamp flex items-center gap-1 text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Приключено</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => onUpdateEventStatus(evt.id, 'completed')}
                        className="px-2.5 py-1 text-xs text-ink hover:text-ink bg-raise hover:bg-rule rounded-lg border border-rule transition-colors"
                      >
                        Отбележи завършено
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Manual Event Creation Modal */}
      {isNewEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6  space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-bold text-ink">
                {editingEvent ? 'Промяна на събитие' : 'Ново календарно събитие'}
              </h3>
              <button
                onClick={closeEventForm}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-mute mb-1">Заглавие на събитието</label>
                <input
                  type="text"
                  placeholder="Напр.: Профилактика на асансьор"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-mute mb-1">Категория</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                  >
                    <option value="inspection">Оглед / Среща</option>
                    <option value="repair">Ремонт</option>
                    <option value="maintenance">Профилактика</option>
                    <option value="construction">Строителна дейност</option>
                    <option value="cleaning">Почистване</option>
                    <option value="rent_deadline">Краен срок за наем</option>
                    <option value="meeting">Общо събрание</option>
                  </select>
                </div>

                <div>
                  <label className="block text-mute mb-1">Приоритет</label>
                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                  >
                    <option value="normal">Нормален</option>
                    <option value="high">Висок</option>
                    <option value="urgent">Спешен</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-mute mb-1">Дата</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink font-tech"
                  />
                </div>
                <div>
                  <label className="block text-mute mb-1">Час</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink font-tech"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-mute mb-1">Отговорна роля</label>
                  <select
                    value={newAssignedRole}
                    onChange={(e: any) => setNewAssignedRole(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                  >
                    <option value="all">Всички</option>
                    <option value="owner">Собственик</option>
                    <option value="craftsman">Майстор / Техник</option>
                    <option value="builder">Строител</option>
                    <option value="tenant">Наемател</option>
                  </select>
                </div>
                <div>
                  <label className="block text-mute mb-1">Свързан апартамент / зона</label>
                  <input
                    type="text"
                    placeholder="Напр. Ап. 5 или Общи части"
                    value={newApartment}
                    onChange={(e) => setNewApartment(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-mute mb-1">Описание и инструкции</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Допълнителни детайли, телефон за връзка или инструменти..."
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              {editingEvent && currentUser.role === 'owner' && onDeleteEvent && (
                <DeleteButton
                  className="mr-auto"
                  onDelete={() => {
                    onDeleteEvent(editingEvent.id);
                    closeEventForm();
                  }}
                />
              )}
              <button
                onClick={closeEventForm}
                className="px-4 py-2 text-xs font-medium text-mute hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={() => {
                  if (!newTitle.trim()) return;
                  const fields = {
                    title: newTitle,
                    category: newCategory,
                    startDateTime: `${newDate}T${newTime}:00`,
                    endDateTime: `${newDate}T18:00:00`,
                    buildingId: currentUser.buildingId,
                    apartmentNumber: newApartment,
                    assignedToName: newAssignedName,
                    assignedRole: newAssignedRole,
                    description: newDescription,
                    priority: newPriority,
                  };
                  if (editingEvent) onUpdateEvent({ ...editingEvent, ...fields });
                  else onCreateEvent({ ...fields, status: 'pending' });
                  closeEventForm();
                }}
                className="px-4 py-2 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors shadow-sm"
              >
                Запази събитието
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
