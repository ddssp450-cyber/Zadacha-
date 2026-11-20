import React, { useState } from 'react';
import { 
  Wrench, 
  Plus, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  X, 
  Check, 
  Camera, 
  Upload, 
  User, 
  DollarSign, 
  Sparkles, 
  Calendar as CalendarIcon,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { 
  RepairTicket, 
  ConstructionDefect, 
  UserRole, 
  UserProfile, 
  RepairPriority, 
  RepairStatus 
} from '../types';
import { DeleteButton, PhotoPicker } from './PhotoPicker';

interface RepairsViewProps {
  currentUser: UserProfile;
  tickets: RepairTicket[];
  defects: ConstructionDefect[];
  onUpdateTicket: (ticket: RepairTicket) => void;
  onCreateTicket: (ticket: Omit<RepairTicket, 'id' | 'ticketNumber'>) => void;
  onUpdateDefect: (defect: ConstructionDefect) => void;
  onCreateDefect: (defect: Omit<ConstructionDefect, 'id' | 'defectNumber'>) => void;
  highlightTicketId?: string;
  isCreateModalOpenExternal?: boolean;
  // Craftsmen added to this building (owner only); used to assign tickets.
  craftsmen?: string[];
  onDeleteTicket?: (id: string) => void;
  onDeleteDefect?: (id: string) => void;
  onCloseCreateModalExternal?: () => void;
}

export const RepairsView: React.FC<RepairsViewProps> = ({
  currentUser,
  tickets,
  defects,
  onUpdateTicket,
  onCreateTicket,
  onUpdateDefect,
  onCreateDefect,
  highlightTicketId,
  isCreateModalOpenExternal,
  craftsmen = [],
  onDeleteTicket,
  onDeleteDefect,
  onCloseCreateModalExternal,
}) => {
  const [activeTab, setActiveTab] = useState<'repairs' | 'defects'>('repairs');
  const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(
    highlightTicketId ? tickets.find((t) => t.id === highlightTicketId) || null : null
  );
  const [isInternalCreateOpen, setIsInternalCreateOpen] = useState(false);
  const isCreateOpen = isCreateModalOpenExternal || isInternalCreateOpen;
  const closeCreateModal = () => {
    setIsInternalCreateOpen(false);
    if (onCloseCreateModalExternal) onCloseCreateModalExternal();
  };

  // New ticket state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<RepairTicket['category']>('plumbing');
  const [newPriority, setNewPriority] = useState<RepairPriority>('high');
  const [newLocation, setNewLocation] = useState(
    currentUser.role === 'tenant' ? `Ап. ${currentUser.apartmentNumber ?? ''}` : 'Общи части'
  );
  const [newApartmentNumber, setNewApartmentNumber] = useState(currentUser.apartmentNumber ?? '');
  const [newEstimatedBudget, setNewEstimatedBudget] = useState(120);

  // Craftsman update state inside modal
  const [visitProposalDate, setVisitProposalDate] = useState(`${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}T14:00`);
  const [materialsInput, setMaterialsInput] = useState('');
  const [costInput, setCostInput] = useState<number>(0);
  const [workNotesInput, setWorkNotesInput] = useState('');

  // Owner budget approval state
  const [approvedBudgetInput, setApprovedBudgetInput] = useState<number>(0);
  const [assignedInput, setAssignedInput] = useState('');
  const [statusInput, setStatusInput] = useState<RepairTicket['status']>('reported');
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [afterPhotosInput, setAfterPhotosInput] = useState<string[]>([]);

  const getPriorityBadge = (priority: RepairPriority) => {
    switch (priority) {
      case 'urgent': return { label: 'Спешно', color: 'text-red bg-red/20 border-red/30' };
      case 'high': return { label: 'Висок', color: 'text-ink bg-hi-soft border-ochre' };
      case 'medium': return { label: 'Среден', color: 'text-mat bg-mat-soft border-mat' };
      case 'low': return { label: 'Нисък', color: 'text-ink bg-sheet border-line' };
      // Unknown values (old rows, AI output) must not crash the page
      default: return { label: String(priority ?? '—'), color: 'text-ink bg-sheet border-line' };
    }
  };

  const getStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case 'reported': return { label: 'Подаден сигнал', color: 'text-ink' };
      case 'approved': return { label: 'Одобрен бюджет', color: 'text-mat' };
      case 'scheduled': return { label: 'Насрочен в календар', color: 'text-mat' };
      case 'in_progress': return { label: 'В процес на ремонт', color: 'text-mat' };
      case 'completed': return { label: 'Приключен', color: 'text-stamp' };
      case 'rejected': return { label: 'Отхвърлен', color: 'text-red' };
      // Unknown values (old rows, AI output) must not crash the page
      default: return { label: String(status ?? '—'), color: 'text-ink bg-sheet border-line' };
    }
  };

  // Tenant / role-based filtering
  const visibleTickets = tickets.filter((t) => {
    if (currentUser.role === 'tenant' && currentUser.apartmentNumber && t.apartmentNumber && t.apartmentNumber !== currentUser.apartmentNumber) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            {currentUser.role === 'tenant' 
              ? `Моите сигнали за ремонт — Апартамент ${currentUser.apartmentNumber ?? ''}`
              : 'Ремонти'}
          </h2>
          <p className="text-xs text-ink mt-0.5">
            {currentUser.role === 'tenant'
              ? 'Какво е счупено, кога идва майсторът. Нов сигнал — със снимка.'
              : 'Сигнал със снимка → бюджет → майстор → проверка. Нищо не се губи по пътя.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Section Switcher (hidden for tenants to keep it simple) */}
          {currentUser.role !== 'tenant' && (
            <div className="flex items-center p-1 bg-sheet border border-line rounded-lg text-xs">
              <button
                onClick={() => setActiveTab('repairs')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'repairs' ? 'bg-mat-soft text-mat border border-mat/60 shadow-sm' : 'text-ink hover:text-ink'
                }`}
              >
                Ремонтни заявки ({tickets.length})
              </button>
              <button
                onClick={() => setActiveTab('defects')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'defects' ? 'bg-mat-soft text-mat border border-mat/60 shadow-sm' : 'text-ink hover:text-ink'
                }`}
              >
                Строителни дефекти ({defects.length})
              </button>
            </div>
          )}

          <button
            onClick={() => setIsInternalCreateOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 text-stamp" />
            <span>{currentUser.role === 'tenant' ? 'Подай сигнал за повреда' : 'Нова заявка'}</span>
          </button>
        </div>
      </div>

      {/* Repairs List View */}
      {activeTab === 'repairs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTickets.map((ticket) => {
            const pBadge = getPriorityBadge(ticket.priority);
            const sBadge = getStatusBadge(ticket.status);
            const isHighlighted = ticket.id === highlightTicketId;

            return (
              <div
                key={ticket.id}
                onClick={() => {
                  setSelectedTicket(ticket);
                  setAssignedInput(ticket.assignedCraftsmanName ?? '');
                  setStatusInput(ticket.status);
                  setAfterPhotosInput([]);
                }}
                className={`flex flex-col justify-between p-4 rounded-2xl bg-sheet border transition-all cursor-pointer hover:border-line hover:bg-raise ${
                  isHighlighted ? 'border-mat/80 ring-1 ring-mat/30' : 'border-line'
                }`}
              >
                <div>
                  {/* Top Bar inside card */}
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-tech text-mat font-bold">
                      {ticket.ticketNumber}
                    </span>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-tech ${pBadge.color}`}>
                      {pBadge.label}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-ink mb-1.5 leading-snug">
                    {ticket.title}
                  </h3>
                  <p className="text-xs text-ink line-clamp-2 mb-3">
                    {ticket.description}
                  </p>

                  {/* Thumbnail if photo exists */}
                  {ticket.beforePhotos && ticket.beforePhotos.length > 0 && (
                    <div className="mb-3 rounded-lg overflow-hidden h-28 border border-line">
                      <img
                        src={ticket.beforePhotos[0]}
                        alt="Снимка на повреда"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="space-y-1 text-[11px] text-ink mb-3 border-t border-line pt-2">
                    <div className="flex justify-between">
                      <span>Локация:</span>
                      <span className="text-ink font-medium">{ticket.locationDetail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Подател:</span>
                      <span className="text-ink">{ticket.reporterName}</span>
                    </div>
                    {ticket.assignedCraftsmanName && (
                      <div className="flex justify-between">
                        <span>Майстор:</span>
                        <span className="text-stamp font-medium">{ticket.assignedCraftsmanName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-line flex items-center justify-between text-xs">
                  <div>
                    <span className="text-mute text-[10px] block">Бюджет:</span>
                    <span className="font-tech font-bold text-ink">
                      {ticket.approvedBudget || ticket.estimatedBudget} €
                    </span>
                  </div>

                  <div className="text-right">
                    <span className={`text-[11px] font-semibold ${sBadge.color}`}>
                      · {sBadge.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Defects List View (For Builder & Owner) */}
      {activeTab === 'defects' && (
        <div className="rounded-2xl border border-line bg-sheet overflow-hidden ">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-ochre" />
              <span>Гаранционни строителни дефекти и констативни протоколи</span>
            </h3>
            <span className="text-xs text-mute font-tech">
              Подрядчик: Елит Строй Констракшън
            </span>
          </div>

          <div className="divide-y divide-line text-xs">
            {defects.map((def) => (
              <div key={def.id} className="p-4 hover:bg-raise/40 transition-colors space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-tech font-bold text-ochre text-xs">
                      {def.defectNumber}
                    </span>
                    <h4 className="font-bold text-ink text-sm">
                      {def.title}
                    </h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-tech ${
                    def.status === 'verified_fixed' 
                      ? 'text-stamp bg-stamp/10 border-stamp/20' 
                      : 'text-ochre bg-hi/10 border-ochre/20'
                  }`}>
                    {def.status === 'verified_fixed' ? 'Оправен и проверен' : 'В процес на отстраняване'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-mute text-[11px]">
                  <div>
                    <span className="text-mute">Местоположение:</span> {def.location}
                  </div>
                  <div>
                    <span className="text-mute">Краен срок за гаранция:</span> {def.deadline}
                  </div>
                  <div>
                    <span className="text-mute">Докладчик:</span> {def.reportedBy}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-raise border border-line/80 text-[11px] text-ink">
                  <span className="text-mute font-semibold">План за отстраняване: </span>
                  {def.actionPlan}
                </div>

                {currentUser.role === 'builder' && def.status !== 'verified_fixed' && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        onUpdateDefect({
                          ...def,
                          status: 'verified_fixed',
                          verifiedAt: new Date().toISOString(),
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-stamp hover:bg-stamp rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Отбележи като завършено и качи констативен протокол</span>
                    </button>
                  </div>
                )}
                {currentUser.role === 'owner' && onDeleteDefect && (
                  <div className="flex justify-end pt-2">
                    <DeleteButton onDelete={() => onDeleteDefect(def.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ticket Details & Action Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-2xl rounded-2xl bg-sheet border border-line p-6  space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-ochre" />
                <h3 className="text-base font-bold text-ink">
                  Заявка {selectedTicket.ticketNumber} · {selectedTicket.title}
                </h3>
              </div>
              {currentUser.role === 'owner' && onDeleteTicket && (
                <DeleteButton
                  className="ml-auto mr-3"
                  onDelete={() => {
                    onDeleteTicket(selectedTicket.id);
                    setSelectedTicket(null);
                  }}
                />
              )}
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description & Metadata */}
            <div className="p-3.5 rounded-xl bg-raise border border-line text-xs space-y-2">
              <p className="text-ink">
                {selectedTicket.description}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-line text-[11px]">
                <div>
                  <span className="text-mute block">Подател:</span>
                  <span className="text-ink font-medium">{selectedTicket.reporterName}</span>
                </div>
                <div>
                  <span className="text-mute block">Локация:</span>
                  <span className="text-ink font-medium">{selectedTicket.locationDetail}</span>
                </div>
                <div>
                  <span className="text-mute block">Краен срок:</span>
                  <span className="text-ink font-tech">{selectedTicket.deadlineDate}</span>
                </div>
                <div>
                  <span className="text-mute block">Майстор:</span>
                  <span className="text-ochre font-medium">{selectedTicket.assignedCraftsmanName || 'Не е назначен'}</span>
                </div>
              </div>
            </div>

            {/* Photos (Before & After) */}
            <div>
              <span className="text-xs font-semibold text-ink block mb-2">
                Снимков архив на повредата:
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-film p-2 text-center">
                  <span className="text-[10px] text-mute block mb-1">Снимка „Преди ремонта“</span>
                  {selectedTicket.beforePhotos && selectedTicket.beforePhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1">
                      {selectedTicket.beforePhotos.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer" className={selectedTicket.beforePhotos.length === 1 ? 'col-span-2' : ''}>
                          <img src={src} alt={`Преди ремонта ${i + 1}`} className="h-36 w-full object-cover rounded-lg" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="h-36 flex items-center justify-center text-mute text-xs">
                      Няма снимка
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-line bg-film p-2 text-center">
                  <span className="text-[10px] text-mute block mb-1">Снимка „След ремонта“</span>
                  {selectedTicket.afterPhotos && selectedTicket.afterPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1">
                      {selectedTicket.afterPhotos.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer" className={selectedTicket.afterPhotos.length === 1 ? 'col-span-2' : ''}>
                          <img src={src} alt={`След ремонта ${i + 1}`} className="h-36 w-full object-cover rounded-lg" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="h-36 flex flex-col items-center justify-center text-mute text-xs">
                      <Camera className="w-5 h-5 mb-1 text-mute" />
                      <span>Очаква се след приключване</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Role Specific Actions Inside Ticket */}
            {currentUser.role === 'owner' && (
              <div className="p-4 rounded-xl bg-raise/40 border border-line text-xs space-y-3">
                <span className="font-semibold text-ochre block">
                  Управление от Собственик / Управител:
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-mute mb-1">Одобрен бюджет (€)</label>
                    <input
                      type="number"
                      defaultValue={selectedTicket.approvedBudget || selectedTicket.estimatedBudget}
                      onChange={(e) => setApprovedBudgetInput(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-sheet border border-rule rounded-lg text-ink font-tech"
                    />
                  </div>
                  <div>
                    <label className="block text-mute mb-1">Назначен майстор</label>
                    <select
                      value={assignedInput}
                      onChange={(e) => setAssignedInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-sheet border border-rule rounded-lg text-ink"
                    >
                      <option value="">{craftsmen.length ? '— Избери —' : 'Добави майстор в „Сграда“'}</option>
                      {[...new Set([...craftsmen, assignedInput].filter(Boolean))].map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-mute mb-1">Статус</label>
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as RepairTicket['status'])}
                    className="w-full px-3 py-1.5 bg-sheet border border-rule rounded-lg text-ink"
                  >
                    <option value="reported">Подаден</option>
                    <option value="approved">Одобрен</option>
                    <option value="scheduled">Насрочен</option>
                    <option value="in_progress">В процес</option>
                    <option value="completed">Приключен</option>
                    <option value="rejected">Отхвърлен</option>
                  </select>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      onUpdateTicket({
                        ...selectedTicket,
                        status: statusInput,
                        approvedBudget: approvedBudgetInput || selectedTicket.approvedBudget,
                        assignedCraftsmanName: assignedInput || undefined,
                        completedDate: statusInput === 'completed' ? selectedTicket.completedDate ?? new Date().toISOString().split('T')[0] : selectedTicket.completedDate,
                      });
                      setSelectedTicket(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-ink bg-raise hover:bg-rule border border-rule rounded-lg transition-colors"
                  >
                    Запази промените
                  </button>
                  <button
                    onClick={() => {
                      onUpdateTicket({
                        ...selectedTicket,
                        status: 'approved',
                        approvedBudget: approvedBudgetInput || selectedTicket.estimatedBudget,
                        assignedCraftsmanName: assignedInput || undefined,
                      });
                      setSelectedTicket(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors"
                  >
                    Одобри бюджет и потвърди ремонт
                  </button>
                </div>
              </div>
            )}

            {/* Craftsman actions */}
            {currentUser.role === 'craftsman' && (
              <div className="p-4 rounded-xl bg-raise/40 border border-line text-xs space-y-3">
                <span className="font-semibold text-ochre block">
                  Действия на Техник / Майстор:
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-mute mb-1">Предложи дата и час за посещение</label>
                    <input
                      type="datetime-local"
                      value={visitProposalDate}
                      onChange={(e) => setVisitProposalDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-sheet border border-rule rounded-lg text-ink font-tech"
                    />
                  </div>
                  <div>
                    <label className="block text-mute mb-1">Реална себестойност (труд + части)</label>
                    <input
                      type="number"
                      placeholder="Напр. 135 €"
                      onChange={(e) => setCostInput(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-sheet border border-rule rounded-lg text-ink font-tech"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-mute mb-1">Използвани материали и извършена дейност</label>
                  <textarea
                    rows={2}
                    placeholder="Напр.: Сменена мека връзка 1/2, нов сифон, тествано за 15 мин под налягане."
                    value={workNotesInput}
                    onChange={(e) => setWorkNotesInput(e.target.value)}
                    className="w-full px-3 py-1.5 bg-sheet border border-rule rounded-lg text-ink"
                  />
                </div>

                <div>
                  <label className="block text-mute mb-1">Снимки след ремонта</label>
                  <PhotoPicker photos={afterPhotosInput} onChange={setAfterPhotosInput} label="Добави снимка" />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      onUpdateTicket({
                        ...selectedTicket,
                        status: 'scheduled',
                        scheduledVisitDate: visitProposalDate,
                        technicianNotes: workNotesInput || selectedTicket.technicianNotes,
                        actualCost: costInput || selectedTicket.actualCost,
                      });
                      setSelectedTicket(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors"
                  >
                    Запиши час и насрочи в календара
                  </button>

                  <button
                    onClick={() => {
                      onUpdateTicket({
                        ...selectedTicket,
                        status: 'completed',
                        completedDate: new Date().toISOString().split('T')[0],
                        afterPhotos: [...(selectedTicket.afterPhotos ?? []), ...afterPhotosInput],
                        actualCost: costInput || selectedTicket.estimatedBudget,
                      });
                      setSelectedTicket(null);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-stamp hover:bg-stamp rounded-lg transition-colors"
                  >
                    Приключи ремонта и качи снимка
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6  space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-bold text-ink">
                Подаване на заявка за ремонт или повреда
              </h3>
              <button onClick={closeCreateModal} className="text-mute hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-mute mb-1">Заглавие на проблема</label>
                <input
                  type="text"
                  placeholder="Напр.: Капе вода от сифона в банята"
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
                    <option value="plumbing">ВиК инсталация</option>
                    <option value="electrical">Електро & Осветление</option>
                    <option value="hvac">Климатизация & Отопление</option>
                    <option value="common_area">Общи части & Врати</option>
                    <option value="elevator">Асансьор</option>
                    <option value="construction_defect">Строителен дефект</option>
                  </select>
                </div>

                <div>
                  <label className="block text-mute mb-1">Приоритет</label>
                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                  >
                    <option value="urgent">Спешно (Теч, авария)</option>
                    <option value="high">Висок</option>
                    <option value="medium">Среден</option>
                    <option value="low">Нисък (Козметичен)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-mute mb-1">Локация / Апартамент</label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>

              <div>
                <label className="block text-mute mb-1">Подробно описание на повредата</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Откога е, шуми ли, капе ли към съседите..."
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>

              <div>
                <label className="block text-mute mb-1">Снимки на повредата (до 4)</label>
                <PhotoPicker photos={newPhotos} onChange={setNewPhotos} label="Прикачи снимка" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={closeCreateModal}
                className="px-4 py-2 text-xs font-medium text-mute hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={() => {
                  if (!newTitle.trim()) return;
                  onCreateTicket({
                    title: newTitle,
                    description: newDescription,
                    category: newCategory,
                    priority: newPriority,
                    status: 'reported',
                    buildingId: currentUser.buildingId,
                    apartmentNumber: newApartmentNumber,
                    reporterRole: currentUser.role,
                    reporterName: currentUser.name,
                    estimatedBudget: newEstimatedBudget,
                    reportedDate: new Date().toISOString().split('T')[0],
                    deadlineDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
                    locationDetail: newLocation,
                    beforePhotos: newPhotos,
                    afterPhotos: [],
                  });
                  closeCreateModal();
                  setNewTitle('');
                  setNewDescription('');
                  setNewPhotos([]);
                }}
                className="px-4 py-2 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors shadow-sm"
              >
                Подай заявката
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
