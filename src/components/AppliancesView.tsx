import React, { useState } from 'react';
import { 
  Cpu, 
  Wrench, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  Plus, 
  AlertTriangle, 
  FileText, 
  ChevronRight, 
  X, 
  Check, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Appliance, UserProfile } from '../types';

interface AppliancesViewProps {
  currentUser: UserProfile;
  appliances: Appliance[];
  onOpenNewTicketForAppliance: (appliance: Appliance) => void;
  onAddServiceLog: (applianceId: string, log: { date: string; technicianName: string; description: string; cost: number }) => void;
}

export const AppliancesView: React.FC<AppliancesViewProps> = ({
  currentUser,
  appliances,
  onOpenNewTicketForAppliance,
  onAddServiceLog,
}) => {
  const [selectedAppliance, setSelectedAppliance] = useState<Appliance | null>(null);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);

  // New service log form
  const [technicianName, setTechnicianName] = useState(currentUser.name);
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceCost, setServiceCost] = useState(120);

  const getStatusBadge = (status: Appliance['status']) => {
    switch (status) {
      case 'operational': return { label: 'Работи, с проверка', color: 'text-stamp bg-stamp/10 border-stamp/20' };
      case 'needs_service': return { label: 'Изисква профилактика', color: 'text-ochre bg-hi/10 border-ochre/20' };
      case 'critical_issue': return { label: 'Критичен проблем', color: 'text-red bg-red/10 border-red/20' };
      case 'decommissioned': return { label: 'Изведен от експлоатация', color: 'text-mute bg-raise border-rule' };
      // Unknown values (old rows, AI output) must not crash the page
      default: return { label: String(status ?? '—'), color: 'text-ink bg-sheet border-line' };
    }
  };

  const calculateWarrantyDays = (expiryDateStr: string) => {
    const expiry = new Date(expiryDateStr).getTime();
    const now = new Date().getTime();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? `${diffDays} дни остават` : 'Изтекла гаранция';
  };

  const sortedAppliances = [...appliances].sort((a, b) => {
    const isATenant = a.apartmentId === currentUser.apartmentId || a.locationName.includes(`Апартамент ${currentUser.apartmentNumber ?? ''}`);
    const isBTenant = b.apartmentId === currentUser.apartmentId || b.locationName.includes(`Апартамент ${currentUser.apartmentNumber ?? ''}`);
    if (isATenant && !isBTenant) return -1;
    if (!isATenant && isBTenant) return 1;
    return 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            {currentUser.role === 'tenant' 
              ? `Уредите в ап. ${currentUser.apartmentNumber ?? ''})`
              : 'Уреди в сградата'}
          </h2>
          <p className="text-xs text-ink mt-0.5">
            {currentUser.role === 'tenant'
              ? 'Какво имаш вкъщи, до кога е гаранцията и къде е книжката'
              : 'Климатици, асансьор, котли, домофон — и кога им изтича гаранцията'}
          </p>
        </div>
      </div>

      {/* Appliances Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {sortedAppliances.map((app) => {
          const status = getStatusBadge(app.status);
          const warrantyText = calculateWarrantyDays(app.warrantyExpiryDate);

          return (
            <div
              key={app.id}
              className="rounded-2xl border border-line bg-sheet overflow-hidden  hover:border-mat/40 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Photo & Status Overlay */}
                <div className="relative h-48 w-full bg-film overflow-hidden">
                  {app.photoUrl ? (
                    <img
                      src={app.photoUrl}
                      alt={app.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // No photo yet: an empty drawing frame instead of a stand-in picture.
                    <div className="hatch-roof grid h-full w-full place-items-center text-[12px] text-mute">
                      <span className="rounded bg-sheet px-2 py-1">Още няма снимка</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-[72px] bg-sheet/92 border-t border-line" />
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-tech border  ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  {app.energyClass && (
                    <div className="absolute top-3 right-3">
                      <span className="px-2 py-0.5 rounded-md bg-stamp/20 text-stamp font-tech text-[11px] font-bold border border-stamp/30">
                        {app.energyClass}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 right-3">
                    <span className="text-[11px] text-mat font-tech">
                      {app.locationName}
                    </span>
                    <h3 className="text-base font-bold text-ink leading-snug">
                      {app.name}
                    </h3>
                  </div>
                </div>

                {/* Passport Spec Sheet */}
                <div className="p-4 space-y-2 text-xs border-b border-line bg-raise">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-mute block">Модел / Производител:</span>
                      <span className="text-ink font-medium">{app.model} ({app.manufacturer})</span>
                    </div>
                    <div>
                      <span className="text-mute block">Сериен номер:</span>
                      <span className="text-ink font-tech">{app.serialNumber}</span>
                    </div>
                    <div>
                      <span className="text-mute block">Гаранция до:</span>
                      <span className="text-ink font-tech">{app.warrantyExpiryDate} ({warrantyText})</span>
                    </div>
                    <div>
                      <span className="text-mute block">Следващ сервиз:</span>
                      <span className="text-stamp font-tech font-semibold">{app.nextMaintenanceDue}</span>
                    </div>
                  </div>
                </div>

                {/* Service History Summary */}
                <div className="p-4 text-xs space-y-2">
                  <span className="text-[11px] font-semibold text-ink uppercase tracking-wider block">
                    Последна профилактика:
                  </span>
                  {app.serviceHistory.length > 0 ? (
                    <div className="p-2.5 rounded-xl bg-film border border-line text-[11px] space-y-1">
                      <div className="flex justify-between text-ink font-tech">
                        <span>{app.serviceHistory[0].date}</span>
                        <span className="text-stamp">{app.serviceHistory[0].cost} €</span>
                      </div>
                      <p className="text-ink">
                        {app.serviceHistory[0].description}
                      </p>
                      <div className="text-mute text-[10px]">
                        Извършил: {app.serviceHistory[0].technicianName}
                      </div>
                    </div>
                  ) : (
                    <div className="text-mute text-[11px]">
                      Няма въведени минали ремонти.
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="p-4 pt-0 flex items-center justify-between gap-2 text-xs">
                <button
                  onClick={() => onOpenNewTicketForAppliance(app)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sheet hover:bg-raise text-ink hover:text-ink border border-line transition-colors"
                >
                  <Wrench className="w-3.5 h-3.5 text-ink" />
                  <span>Подай сигнал за ремонт</span>
                </button>

                {currentUser.role !== 'tenant' && (
                <button
                  onClick={() => {
                    setSelectedAppliance(app);
                    setIsServiceModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mat hover:bg-mat-deep text-white border border-mat/40 transition-colors font-medium shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-stamp" />
                  <span>Впиши сервиз / профилактика</span>
                </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Service Record Modal */}
      {isServiceModalOpen && selectedAppliance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-md rounded-2xl bg-sheet border border-line p-6  space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-bold text-ink">
                Вписване на сервизна дейност: {selectedAppliance.name}
              </h3>
              <button
                onClick={() => setIsServiceModalOpen(false)}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-mute mb-1">Име на техника / Сервизна фирма</label>
                <input
                  type="text"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>

              <div>
                <label className="block text-mute mb-1">Стойност на профилактиката / ремонта (€)</label>
                <input
                  type="number"
                  value={serviceCost}
                  onChange={(e) => setServiceCost(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink font-tech"
                />
              </div>

              <div>
                <label className="block text-mute mb-1">Описание на извършената дейност и заменени части</label>
                <textarea
                  rows={3}
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  placeholder="Напр.: Смяна на филтри, замерване на работно налягане, почистване на топлообменник..."
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={() => setIsServiceModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-mute hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={() => {
                  if (!serviceDescription.trim()) return;
                  onAddServiceLog(selectedAppliance.id, {
                    date: new Date().toISOString().split('T')[0],
                    technicianName: technicianName,
                    description: serviceDescription,
                    cost: serviceCost,
                  });
                  setIsServiceModalOpen(false);
                  setServiceDescription('');
                }}
                className="px-4 py-2 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors shadow-sm"
              >
                Запази в паспорта
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
