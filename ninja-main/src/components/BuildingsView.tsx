import React, { useState } from 'react';
import { 
  Building2, 
  Home, 
  Users, 
  Droplets, 
  Zap, 
  ShieldCheck, 
  Search, 
  Filter, 
  Plus, 
  X, 
  Check, 
  MapPin, 
  Phone, 
  Mail, 
  FileText,
  ChevronRight,
  ExternalLink,
  Wrench,
  CreditCard,
  AlertCircle
} from 'lucide-react';
import { Building, Apartment, UserProfile, PaymentObligation, RepairTicket } from '../types';
import { SectionDrawing } from './Drawing';
import { ApartmentFormModal, BuildingFields, BuildingFormModal, Member, MembersPanel } from './BuildingAdmin';

interface BuildingsViewProps {
  currentUser: UserProfile;
  building: Building;
  apartments: Apartment[];
  payments: PaymentObligation[];
  repairTickets: RepairTicket[];
  onUpdateApartment: (apartment: Apartment) => void;
  onSaveApartment: (apartment: Apartment) => void;
  onUpdateBuilding: (fields: BuildingFields) => Promise<unknown>;
  onDeleteBuilding: () => Promise<unknown>;
  onDeleteApartment: (id: string) => void;
  members: Member[];
  onAddMember: (m: { email: string; role: UserProfile['role']; apartmentNumber?: string }) => Promise<unknown>;
  onRemoveMember: (email: string) => Promise<unknown>;
  onNavigateTab: (tab: string, highlightItemId?: string) => void;
}

export const BuildingsView: React.FC<BuildingsViewProps> = ({
  currentUser,
  building,
  apartments,
  payments,
  repairTickets,
  onUpdateApartment,
  onSaveApartment,
  onUpdateBuilding,
  onDeleteBuilding,
  onDeleteApartment,
  members,
  onAddMember,
  onRemoveMember,
  onNavigateTab,
}) => {
  const isOwner = currentUser.role === 'owner';
  const [isBuildingFormOpen, setIsBuildingFormOpen] = useState(false);
  // undefined = closed, null = new apartment
  const [apartmentForm, setApartmentForm] = useState<Apartment | null | undefined>(undefined);

  const [selectedApartment, setSelectedApartment] = useState<Apartment | null>(null);
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'facade' | 'grid'>('facade');

  // Meter update form
  const [isMeterModalOpen, setIsMeterModalOpen] = useState(false);
  const [editingApartment, setEditingApartment] = useState<Apartment | null>(null);
  const [newWaterReading, setNewWaterReading] = useState<number>(0);
  const [newElecReading, setNewElecReading] = useState<number>(0);

  const filteredApartments = apartments.filter((apt) => {
    if (floorFilter !== 'all' && apt.floor !== Number(floorFilter)) return false;
    if (statusFilter !== 'all' && apt.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        apt.number.includes(q) ||
        (apt.tenantName && apt.tenantName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Group apartments by floor, top floor first
  const floorNumbers = [...new Set(apartments.map((a) => a.floor))].sort((a, b) => b - a);
  const apartmentsByFloor: Record<number, Apartment[]> = Object.fromEntries(
    floorNumbers.map((f) => [f, apartments.filter((a) => a.floor === f)])
  );

  const getStatusLabel = (status: Apartment['status']) => {
    switch (status) {
      case 'occupied': return { label: 'Зает', color: 'text-stamp bg-stamp/10 border-stamp/20' };
      case 'vacant': return { label: 'Свободен', color: 'text-mat bg-mat/10 border-mat/20' };
      case 'under_repair': return { label: 'В ремонт', color: 'text-ochre bg-hi/10 border-ochre/20' };
      // Unknown values (old rows, AI output) must not crash the page
      default: return { label: String(status ?? '—'), color: 'text-ink bg-sheet border-line' };
    }
  };

  const handleSaveMeters = () => {
    if (!editingApartment) return;
    const updated: Apartment = {
      ...editingApartment,
      waterMeterReading: newWaterReading,
      electricMeterReading: newElecReading,
      lastMeterUpdate: new Date().toISOString().split('T')[0],
    };
    onUpdateApartment(updated);
    if (selectedApartment?.id === updated.id) {
      setSelectedApartment(updated);
    }
    setIsMeterModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Building Master Digital Twin Card */}
      <div className="rounded-2xl border border-line bg-sheet overflow-hidden ">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          <div className="lg:col-span-7 p-5 border-b lg:border-b-0 lg:border-r border-line">
            <p className="mb-3 font-tech text-[12px] uppercase tracking-[0.08em] text-mute">Разрез · вход А</p>
            <SectionDrawing apartments={apartments} payments={payments} repairs={repairTickets} onOpen={onNavigateTab} />
          </div>

          <div className="lg:col-span-5 p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="text-xs text-ink font-tech flex items-center gap-1.5 mb-1">
                <MapPin className="w-3.5 h-3.5 text-mat" />
                <span>{building.city}, {building.address} ({building.postalCode})</span>
              </div>
              <h2 className="text-2xl font-bold text-ink tracking-tight">
                {building.name}
              </h2>
              <p className="text-xs text-ink mt-2 leading-relaxed">
                {apartments.length} апартамента · {building.totalFloors} етажа · построена {building.yearBuilt} г.
              </p>
              {isOwner && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setIsBuildingFormOpen(true)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors"
                  >
                    Редактирай сградата
                  </button>
                  <button
                    onClick={() => setApartmentForm(null)}
                    className="px-3 py-1.5 text-xs font-medium text-ink bg-raise hover:bg-rule rounded-lg border border-rule transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Нов апартамент
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-line pt-3 text-xs">
              <div className="text-[11px] font-semibold text-ink uppercase tracking-wider">
                Удобства и инфраструктура:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {building.facilities.map((fac, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-film text-ink text-[11px] border border-ochre"
                  >
                    {fac}
                  </span>
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-mute text-[11px] block">Домоуправител:</span>
                <span className="text-ink font-medium">{building.contactManager}</span>
              </div>
              <div className="text-right">
                <span className="text-mute text-[11px] block">Телефон:</span>
                <span className="text-stamp font-tech">{building.phoneManager}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Visual Selector: Building Façade of Enamel Plates vs Standard Grid */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-sheet border border-line text-xs">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-ink text-sm flex items-center gap-2">
            <Home className="w-4 h-4 text-mat" />
            <span>Апартаменти</span>
          </h3>

          <div className="flex items-center p-0.5 bg-film rounded-lg border border-line text-xs">
            <button
              onClick={() => setViewMode('facade')}
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'facade' ? 'bg-mat text-white font-bold' : 'text-white hover:text-white'
              }`}
            >
              Табели
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-film text-ink font-bold border border-ochre' : 'text-ink hover:text-ink'
              }`}
            >
              Списък
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-mat border border-line" />
            <span>Платен наем</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-mat border-2 border-line" />
            <span>Отворен ремонт</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-mat border-2 border-red" />
            <span>Просрочие</span>
          </span>
        </div>
      </div>

      {/* 3. Building Façade Enamel Plates View */}
      {viewMode === 'facade' && (
        <div className="p-6 rounded-2xl border border-line bg-sheet  space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <span className="text-xs font-semibold text-ink uppercase tracking-wider">
              Вход А · натисни апартамент за подробности
            </span>
            <span className="text-xs text-mute font-tech">
              {apartments.length} апартамента
            </span>
          </div>

          <div className="space-y-3">
            {floorNumbers.map((floor) => {
              const floorApts = apartmentsByFloor[floor] || [];

              return (
                <div
                  key={floor}
                  className="grid grid-cols-1 sm:grid-cols-[60px_1fr] items-center gap-3 p-2 rounded-xl bg-raise border border-line/60"
                >
                  <div className="text-center font-tech font-bold text-xs text-ink py-1">
                    ЕТ {floor}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {floorApts.map((apt) => {
                      const isRepairActive = apt.status === 'under_repair' || repairTickets.some((t) => t.apartmentNumber === apt.number && t.status !== 'completed' && t.status !== 'rejected');
                      const isOverdue = payments.some((p) => p.apartmentNumber === apt.number && p.status === 'overdue');
                      const isVacant = apt.status === 'vacant';
                      const isUserApt = currentUser.role === 'tenant' && currentUser.apartmentNumber === apt.number;

                      let plateClass = 'plate';
                      if (isVacant) plateClass = 'plate-empty';
                      else if (isRepairActive) plateClass = 'plate plate-flag';
                      else if (isOverdue) plateClass = 'plate plate-overdue';

                      return (
                        <div
                          key={apt.id}
                          onClick={() => setSelectedApartment(apt)}
                          className={`${plateClass} p-3 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg flex flex-col justify-between min-h-[92px] ${
                            isUserApt ? 'ring-2 ring-mat ring-offset-2 ring-offset-[#0c0d11]' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-tech text-base font-extrabold tracking-tight">
                              Ап. {apt.number}
                            </span>
                            {isRepairActive && (
                              <Wrench className="w-3.5 h-3.5 text-ink" />
                            )}
                            {isOverdue && (
                              <AlertCircle className="w-3.5 h-3.5 text-red" />
                            )}
                          </div>

                          <div className="mt-1">
                            <div className="text-[11px] font-medium truncate opacity-95">
                              {apt.tenantName || 'Свободен имот'}
                            </div>
                            <div className="text-[10px] opacity-80 flex items-center justify-between mt-0.5 font-tech">
                              <span>{apt.areaSqM} м²</span>
                              <span>{apt.monthlyRent} €</span>
                            </div>
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

      {/* 4. Standard Apartment Grid Cards */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredApartments.map((apt) => {
            const status = getStatusLabel(apt.status);
            const isUserApt = currentUser.role === 'tenant' && currentUser.apartmentNumber === apt.number;

            return (
              <div
                key={apt.id}
                onClick={() => setSelectedApartment(apt)}
                className={`p-4 rounded-2xl bg-sheet border transition-all cursor-pointer hover:border-rule hover:bg-raise/50 flex flex-col justify-between ${
                  isUserApt ? 'ring-2 ring-ochre/80 border-ochre' : 'border-line'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold text-ink font-tech">
                      Ап. {apt.number}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-tech border ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="text-xs text-mute space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span>Етаж / Площ:</span>
                      <span className="text-ink font-medium">Ет. {apt.floor} · {apt.areaSqM} м²</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Наемател:</span>
                      <span className="text-ink font-medium truncate max-w-[140px]">
                        {apt.tenantName || 'Няма наемател'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Месечен наем:</span>
                      <span className="text-ochre font-tech font-bold">
                        {apt.monthlyRent} €
                      </span>
                    </div>
                  </div>

                  {/* Meters snapshot */}
                  <div className="p-2.5 rounded-xl bg-film border border-line/80 text-[11px] grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 text-mat">
                      <Droplets className="w-3.5 h-3.5" />
                      <span className="font-tech">{apt.waterMeterReading} m³</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-ochre justify-end">
                      <Zap className="w-3.5 h-3.5" />
                      <span className="font-tech">{apt.electricMeterReading} kWh</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-line/80 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-mute">
                    Отчет: {apt.lastMeterUpdate}
                  </span>
                  <span className="text-ochre font-medium flex items-center gap-1">
                    <span>Детайли</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apartment Detail Passport Modal */}
      {selectedApartment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-xl rounded-2xl bg-sheet border border-line p-6  space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="plate px-2.5 py-1 text-xs font-tech font-bold">
                  АП. {selectedApartment.number}
                </div>
                <h3 className="text-base font-bold text-ink">
                  Дигитален паспорт · Етаж {selectedApartment.floor} (Вход {selectedApartment.entrance || 'А'})
                </h3>
              </div>
              <button
                onClick={() => setSelectedApartment(null)}
                className="text-ink hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-film p-3.5 rounded-xl border border-line">
              <div>
                <span className="text-mute block">Квадратура:</span>
                <span className="text-ink font-bold">{selectedApartment.areaSqM} кв. м ({selectedApartment.rooms} стаи)</span>
              </div>
              <div>
                <span className="text-mute block">Статус на ползване:</span>
                <span className="text-stamp font-semibold">{getStatusLabel(selectedApartment.status).label}</span>
              </div>
              <div>
                <span className="text-mute block">Наемател:</span>
                <span className="text-ink font-medium">{selectedApartment.tenantName || 'Свободен'}</span>
              </div>
              <div>
                <span className="text-mute block">Телефон за връзка:</span>
                <span className="text-ink font-tech">{selectedApartment.tenantPhone || '—'}</span>
              </div>
              <div>
                <span className="text-mute block">Договорен наем:</span>
                <span className="text-ink font-tech font-bold">{selectedApartment.monthlyRent} €/мес.</span>
              </div>
              <div>
                <span className="text-mute block">Такса поддръжка:</span>
                <span className="text-ink font-tech">{selectedApartment.monthlyMaintenanceFee} €/мес.</span>
              </div>
            </div>

            {/* Meters reading section */}
            <div className="p-4 rounded-xl bg-raise border border-line text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">Показания на измервателните уреди:</span>
                <span className="text-[11px] text-ink font-tech">
                  Последно въведени: {selectedApartment.lastMeterUpdate}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-film rounded-lg border border-line">
                  <span className="text-[11px] text-ink flex items-center gap-1 mb-1">
                    <Droplets className="w-3.5 h-3.5 text-mat" />
                    <span>Водомер студена вода:</span>
                  </span>
                  <span className="text-lg font-bold font-tech text-mat">
                    {selectedApartment.waterMeterReading} m³
                  </span>
                </div>

                <div className="p-3 bg-film rounded-lg border border-line">
                  <span className="text-[11px] text-ink flex items-center gap-1 mb-1">
                    <Zap className="w-3.5 h-3.5 text-stamp" />
                    <span>Електромер (Дневна/Нощна):</span>
                  </span>
                  <span className="text-lg font-bold font-tech text-stamp">
                    {selectedApartment.electricMeterReading} kWh
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    setEditingApartment(selectedApartment);
                    setNewWaterReading(selectedApartment.waterMeterReading);
                    setNewElecReading(selectedApartment.electricMeterReading);
                    setIsMeterModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm"
                >
                  Въведи нови показания
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-line">
              <button
                onClick={() => {
                  setSelectedApartment(null);
                  onNavigateTab('payments');
                }}
                className="text-xs text-mat hover:text-ink flex items-center gap-1 font-medium"
              >
                <span>Виж плащания за този апартамент</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2">
                {isOwner && (
                  <button
                    onClick={() => {
                      setApartmentForm(selectedApartment);
                      setSelectedApartment(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-mat hover:text-ink"
                  >
                    Редактирай
                  </button>
                )}
                <button
                  onClick={() => setSelectedApartment(null)}
                  className="px-4 py-2 text-xs font-medium text-ink hover:text-ink"
                >
                  Затвори
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Meter Readings Sub-Modal */}
      {isMeterModalOpen && editingApartment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="w-full max-w-sm rounded-2xl bg-sheet border border-line p-5  space-y-4">
            <h4 className="text-sm font-bold text-ink">
              Актуализация на измервателни уреди: Ап. {editingApartment.number}
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink mb-1">Ново показание водомер (m³)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newWaterReading}
                  onChange={(e) => setNewWaterReading(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:border-mat focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-ink mb-1">Ново показание електромер (kWh)</label>
                <input
                  type="number"
                  step="0.5"
                  value={newElecReading}
                  onChange={(e) => setNewElecReading(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:border-mat focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={() => setIsMeterModalOpen(false)}
                className="px-3 py-1.5 text-xs text-ink hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={handleSaveMeters}
                className="px-3.5 py-1.5 text-xs font-semibold text-ink bg-stamp-soft hover:bg-stamp-soft rounded-lg border border-stamp/50 transition-colors shadow-sm"
              >
                Запази показанията
              </button>
            </div>
          </div>
        </div>
      )}
      {isOwner && <MembersPanel members={members} onAdd={onAddMember} onRemove={onRemoveMember} />}

      {isBuildingFormOpen && (
        <BuildingFormModal initial={building} onSave={onUpdateBuilding} onDelete={onDeleteBuilding} onClose={() => setIsBuildingFormOpen(false)} />
      )}
      {apartmentForm !== undefined && (
        <ApartmentFormModal
          initial={apartmentForm ?? undefined}
          buildingId={building.id}
          onSave={onSaveApartment}
          onDelete={onDeleteApartment}
          onClose={() => setApartmentForm(undefined)}
        />
      )}
    </div>
  );
};
