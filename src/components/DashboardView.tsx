import React, { useState } from 'react';
import { 
  Building2, 
  CreditCard, 
  Wrench, 
  Calendar as CalendarIcon, 
  Plus, 
  ArrowUpRight, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Sparkles, 
  ChevronRight,
  ShieldCheck,
  Users,
  Droplets,
  Zap,
  FileText,
  Camera,
  Home,
  Phone,
  Copy,
  Check,
  Upload,
  CheckCircle2,
  Info
} from 'lucide-react';
import { DailySummaryBanner } from './DailySummaryBanner';
import { Dim, Legend, SectionDrawing } from './Drawing';
import { 
  UserProfile, 
  Building, 
  PaymentObligation, 
  RepairTicket, 
  CalendarEvent,
  Apartment,
  Appliance
} from '../types';

interface DashboardViewProps {
  currentUser: UserProfile;
  building: Building;
  payments: PaymentObligation[];
  repairTickets: RepairTicket[];
  calendarEvents: CalendarEvent[];
  apartments?: Apartment[];
  onUpdateApartment?: (apartment: Apartment) => void;
  appliances?: Appliance[];
  onNavigateTab: (tab: string, highlightItemId?: string) => void;
  openAiChatWithPrompt: (prompt: string) => void;
  onOpenNewTicketModal: () => void;
  onOpenNewEventModal: () => void;
  onOpenDiagnosisModal?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  building,
  payments,
  repairTickets,
  calendarEvents,
  apartments = [],
  onUpdateApartment,
  appliances = [],
  onNavigateTab,
  openAiChatWithPrompt,
  onOpenNewTicketModal,
  onOpenNewEventModal,
  onOpenDiagnosisModal,
}) => {
  // Meter update modal state for tenant
  const [isMeterModalOpen, setIsMeterModalOpen] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [showIbanModal, setShowIbanModal] = useState(false);

  // Tenant apartment resolution
  const tenantApt =
    apartments.find((a) => currentUser.apartmentNumber && a.number === currentUser.apartmentNumber) ||
    apartments.find((a) => a.tenantName && a.tenantName === currentUser.name);

  const [waterInput, setWaterInput] = useState<number>(tenantApt?.waterMeterReading ?? 0);
  const [elecInput, setElecInput] = useState<number>(tenantApt?.electricMeterReading ?? 0);
  const [meterSavedMessage, setMeterSavedMessage] = useState(false);

  // Calculations
  const pendingPayments = payments.filter((p) => p.status === 'pending_verification' || p.status === 'declared_paid');
  const overduePayments = payments.filter((p) => p.status === 'overdue');
  const totalCollected = payments
    .filter((p) => p.status === 'confirmed_paid')
    .reduce((acc, curr) => acc + (curr.paidAmount || curr.amount), 0);
  const activeRepairs = repairTickets.filter((r) => r.status !== 'completed' && r.status !== 'rejected');
  const upcomingEvents = calendarEvents.slice(0, 4);

  // Tenant-specific filtered items
  const myPayments = payments.filter(
    (p) => p.apartmentNumber === (currentUser.apartmentNumber ?? '') || p.tenantName === currentUser.name
  );
  const myCurrentPayment = myPayments.find((p) => p.status !== 'confirmed_paid') ?? myPayments[0];

  const myTickets = repairTickets.filter(
    (t) => t.apartmentNumber === (currentUser.apartmentNumber ?? '') || 
           t.reporterName === currentUser.name ||
           (tenantApt && t.apartmentId === tenantApt.id)
  );

  const handleCopyIban = (iban: string) => {
    navigator.clipboard.writeText(iban);
    setCopiedIban(true);
    setTimeout(() => setCopiedIban(false), 2500);
  };

  const handleSaveMeterReadings = () => {
    if (!tenantApt || !onUpdateApartment) return;
    const updated: Apartment = {
      ...tenantApt,
      waterMeterReading: Number(waterInput),
      electricMeterReading: Number(elecInput),
      lastMeterUpdate: new Date().toISOString().split('T')[0],
    };
    onUpdateApartment(updated);
    setMeterSavedMessage(true);
    setTimeout(() => {
      setMeterSavedMessage(false);
      setIsMeterModalOpen(false);
    }, 1200);
  };

  // Dedicated simplified portal for tenants
  if (currentUser.role === 'tenant') {
    return (
      <div className="space-y-6">
        {/* 1. Welcome & Apartment Identity Banner */}
        <div className="rounded-2xl border border-line bg-sheet p-5 sm:p-6  relative overflow-hidden">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="plate w-12 h-12 flex items-center justify-center text-ink font-extrabold text-base shadow-md shrink-0">
                {currentUser.apartmentNumber ?? ''}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
                    Здравей, {currentUser.name.split(' ')[0]}.
                  </h2>
                  <span className="text-[11px] font-semibold text-stamp bg-stamp-soft px-2 py-0.5 rounded border border-stamp">
                    Активен наемател
                  </span>
                </div>
                <p className="text-xs text-ink mt-1">
                  Апартамент {currentUser.apartmentNumber ?? ''} · Етаж {tenantApt?.floor ?? '—'}, Вход {tenantApt?.entrance || 'А'} · {building.name} ({building.address})
                </p>
                <div className="flex items-center gap-3 text-[11px] text-ink/80 mt-1.5 font-tech">
                  <span>Управител: <strong>{building.contactManager}</strong></span>
                  <span>·</span>
                  <a href={`tel:${building.phoneManager.replace(/\s/g, '')}`} className="text-mat hover:underline flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>{building.phoneManager}</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onNavigateTab('repairs')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ink hover:text-ink bg-sheet hover:bg-raise rounded-xl border border-line transition-colors"
              >
                <Wrench className="w-3.5 h-3.5 text-ink" />
                <span>Моите ремонти ({myTickets.length})</span>
              </button>
              <button
                onClick={() => openAiChatWithPrompt('Какви са правилата за тишина и кога се изхвърля боклука в сградата?')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stamp bg-stamp-soft hover:bg-stamp-soft rounded-xl border border-stamp transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-stamp" />
                <span>AI Помощник</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Top 3 Large Action Cards for Tenant (Zero-friction) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Rent Payment Status */}
          <div className="p-5 rounded-2xl bg-sheet border border-line shadow-lg flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-ink mb-2">
                <span className="font-semibold flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-mat" />
                  <span>Наем за текущия месец</span>
                </span>
                {myCurrentPayment?.status === 'confirmed_paid' ? (
                  <span className="text-[10px] font-semibold text-stamp bg-stamp-soft px-2 py-0.5 rounded border border-stamp">
                    Платено
                  </span>
                ) : myCurrentPayment?.status === 'pending_verification' ? (
                  <span className="text-[10px] font-semibold text-ink bg-hi-soft px-2 py-0.5 rounded border border-ochre">
                    Очаква преглед
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-red bg-red/30 px-2 py-0.5 rounded border border-red/30">
                    Дължимо
                  </span>
                )}
              </div>

              <div className="text-2xl font-bold font-tech tabular-nums text-ink">
                {(myCurrentPayment?.amount ?? 0).toLocaleString('bg-BG')} €
              </div>
              <p className="text-[11px] text-ink mt-1">
                {myCurrentPayment?.status === 'pending_verification' 
                  ? 'Платежното нареждане е изпратено за потвърждение.' 
                  : myCurrentPayment ? `Срок за превод: до ${new Date(myCurrentPayment.dueDate).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Нямаш задължения в момента.'}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-line">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigateTab('payments')}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-xl transition-colors border border-mat/40 shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5 text-stamp" />
                  <span>Качи платежно / бележка</span>
                </button>
                <button
                  onClick={() => setShowIbanModal(true)}
                  className="px-3 py-2 text-xs font-medium text-ink hover:text-ink bg-sheet hover:bg-raise rounded-xl border border-line transition-colors"
                  title="Виж банкова сметка"
                >
                  IBAN
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Snap with Phone Camera */}
          <div className="p-5 rounded-2xl bg-sheet border border-stamp shadow-lg flex flex-col justify-between space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-stamp/5 rounded-full blur-xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between text-xs text-ink mb-2">
                <span className="font-semibold flex items-center gap-1.5 text-stamp">
                  <Camera className="w-4 h-4 text-stamp" />
                  <span>Снимай повреда от телефон</span>
                </span>
                <span className="text-[10px] font-semibold text-stamp bg-stamp-soft px-2 py-0.5 rounded border border-stamp">
                  AI Анализ
                </span>
              </div>
              <div className="text-sm font-bold text-ink leading-snug">
                Капе кран, теч или повреден уред?
              </div>
              <p className="text-[11px] text-ink mt-1 leading-relaxed">
                Снимайте проблема с камерата на телефона — AI разпознава повредата и автоматично изпраща заявка до майстора.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-stamp/60">
              <button
                onClick={onOpenDiagnosisModal}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-mat hover:bg-mat-deep rounded-xl transition-all shadow-md shadow-ink/10 border border-mat/40"
              >
                <Camera className="w-4 h-4 text-ink" />
                <span>Отвори камерата за снимка</span>
              </button>
            </div>
          </div>

          {/* Card 3: Water & Electricity Meters */}
          <div className="p-5 rounded-2xl bg-sheet border border-ochre shadow-lg flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-ink mb-2">
                <span className="font-semibold flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-mat" />
                  <span>Показания на измервателни уреди</span>
                </span>
                <span className="text-[10px] font-tech text-ink">
                  {tenantApt?.lastMeterUpdate || '—'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="p-2.5 rounded-xl bg-film border border-line">
                  <div className="text-[10px] text-ink flex items-center gap-1">
                    <Droplets className="w-3 h-3 text-mat" />
                    <span>Водомер</span>
                  </div>
                  <div className="text-base font-bold font-tech tabular-nums text-ink mt-0.5">
                    {tenantApt ? `${tenantApt.waterMeterReading} m³` : '—'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-film border border-line">
                  <div className="text-[10px] text-ink flex items-center gap-1">
                    <Zap className="w-3 h-3 text-ink" />
                    <span>Електромер</span>
                  </div>
                  <div className="text-base font-bold font-tech tabular-nums text-ink mt-0.5">
                    {tenantApt ? `${tenantApt.electricMeterReading} kWh` : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-ochre">
              <button
                disabled={!tenantApt}
                onClick={() => {
                  setWaterInput(tenantApt?.waterMeterReading ?? 0);
                  setElecInput(tenantApt?.electricMeterReading ?? 0);
                  setIsMeterModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-ink hover:text-ink bg-hi-soft hover:bg-raise rounded-xl border border-ochre transition-colors disabled:opacity-40"
              >
                <span>Въведи нови показания с 1 клик</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Two Column Details: Active Repairs & Urgent Contacts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: My Active Repairs & Status */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-line bg-sheet p-5 ">
              <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-stamp" />
                  <h3 className="text-sm font-bold text-ink">
                    Моите ремонти & посещения на майстори
                  </h3>
                </div>
                <button
                  onClick={() => onNavigateTab('repairs')}
                  className="text-xs text-mat hover:text-ink flex items-center gap-1 font-medium"
                >
                  <span>Виж всички</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {myTickets.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink">
                  <CheckCircle2 className="w-8 h-8 text-stamp mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-ink">Нямате активни аварии или повреди</p>
                  <p className="text-[11px] text-ink/80 mt-1">
                    Ако нещо се счупи, използвайте бутона „Снимай повреда от телефон“.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="p-4 rounded-xl bg-film border border-line hover:border-mat/40 transition-colors space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-tech text-xs font-bold text-mat">
                              {ticket.ticketNumber}
                            </span>
                            <span className="text-[10px] font-semibold text-stamp bg-stamp-soft px-1.5 py-0.5 rounded border border-stamp">
                              {ticket.status === 'approved' ? 'Одобрен от хазяин' : ticket.status === 'scheduled' ? 'Насрочен час' : 'В процес'}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-ink mt-1">
                            {ticket.title}
                          </h4>
                          <p className="text-[11px] text-ink mt-0.5">
                            {ticket.locationDetail}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-ink block">Одобрен бюджет</span>
                          <span className="text-xs font-bold font-tech text-stamp">
                            {ticket.approvedBudget || ticket.estimatedBudget} €
                          </span>
                        </div>
                      </div>

                      {/* Visit Details Box */}
                      <div className="p-3 rounded-lg bg-sheet border border-line text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-ink">Насрочено посещение:</span>
                          <strong className="text-ink font-tech">
                            {ticket.scheduledVisitDate 
                              ? new Date(ticket.scheduledVisitDate).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' ч.'
                              : 'Уточнява се'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-ink">Отговорен техник:</span>
                          <strong className="text-mat">{ticket.assignedCraftsmanName || 'Още не е назначен'}</strong>
                        </div>
                        {ticket.technicianNotes && (
                          <p className="text-[11px] text-ink/80 italic pt-1 border-t border-line">
                            Бележка от майстора: „{ticket.technicianNotes}“
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        {building.phoneManager ? (
                          <a
                            href={`tel:${building.phoneManager.replace(/\s/g, '')}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors border border-mat/40"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Свържи се с управителя</span>
                          </a>
                        ) : <span />}
                        <button
                          onClick={onOpenDiagnosisModal}
                          className="text-xs font-medium text-ink hover:text-ink"
                        >
                          Снимай ново развитие
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My Appliances Strip */}
            <div className="rounded-2xl border border-line bg-sheet p-5 ">
              <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-ink" />
                  <h3 className="text-sm font-bold text-ink">
                    Уреди в Апартамент {currentUser.apartmentNumber ?? ''}
                  </h3>
                </div>
                <button
                  onClick={() => onNavigateTab('appliances')}
                  className="text-xs text-ink hover:text-ink"
                >
                  Виж паспорти
                </button>
              </div>

              {appliances.length === 0 ? (
                <p className="text-xs text-mute">Няма добавени уреди за този имот.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {appliances
                    .filter((ap) => !ap.apartmentId || (tenantApt && ap.apartmentId === tenantApt.id))
                    .slice(0, 4)
                    .map((ap) => (
                      <div key={ap.id} className="p-3 rounded-xl bg-film border border-line space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink truncate">{ap.name}</span>
                          <span className="text-[10px] text-stamp font-medium shrink-0">
                            {ap.status === 'operational' ? 'Изправен' : ap.status === 'needs_service' ? 'За сервиз' : 'Проблем'}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink truncate">
                          {ap.locationName}{ap.warrantyExpiryDate ? ` · Гаранция до ${ap.warrantyExpiryDate}` : ''}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Emergency & Direct Contacts */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-line bg-sheet p-5  space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-line">
                <Phone className="w-4 h-4 text-mat" />
                <h3 className="text-sm font-bold text-ink">
                  Важни контакти на 1 клик
                </h3>
              </div>
              <p className="text-[11px] text-ink">
                При спешен въпрос, теч или проблем в сградата се свържете директно:
              </p>

              <div className="space-y-2">
                {building.phoneManager ? (
                  <a
                    href={`tel:${building.phoneManager.replace(/\s/g, '')}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-film hover:bg-sheet border border-line transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-hi-soft border border-ochre flex items-center justify-center text-ink">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-ink group-hover:text-mat transition-colors">
                          Домоуправител ({building.contactManager || 'Управител'})
                        </div>
                        <div className="text-[11px] text-ink font-tech">{building.phoneManager}</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 text-[11px] font-semibold text-white bg-mat rounded-lg">
                      Обади се
                    </span>
                  </a>
                ) : (
                  <div className="p-3 rounded-xl bg-film border border-line text-xs text-mute">
                    Домоуправител: {building.contactManager || 'Няма посочен телефон за контакт'}
                  </div>
                )}
              </div>
            </div>

            {/* Quiet Hours & Building Notes */}
            <div className="p-4 rounded-2xl bg-film border border-line text-xs space-y-2">
              <div className="flex items-center gap-2 text-ink font-semibold">
                <Info className="w-4 h-4 text-ink" />
                <span>Правила на етажната собственост</span>
              </div>
              <ul className="space-y-1 text-[11px] text-ink list-disc list-inside">
                <li>Часове за тишина: 14:00 - 16:00 ч. и 22:00 - 08:00 ч.</li>
                <li>Изхвърляне на битови отпадъци: контейнери в двора.</li>
                <li>Входната врата се заключва автоматично след 21:00 ч.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Meter Update Modal */}
        {isMeterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
            <div className="relative w-full max-w-md rounded-2xl bg-sheet border border-line p-6  space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-mat" />
                  <h3 className="text-sm font-bold text-ink">
                    Въвеждане на показания (Ап. {currentUser.apartmentNumber ?? ''})
                  </h3>
                </div>
                <button
                  onClick={() => setIsMeterModalOpen(false)}
                  className="text-ink hover:text-ink p-1 rounded"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-ink mb-1 font-medium">
                    Водомер — кубични метри (m³)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={waterInput}
                    onChange={(e) => setWaterInput(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:outline-none focus:border-mat"
                  />
                  <span className="text-[10px] text-ink/70 mt-0.5 block">
                    Предишно показание: {tenantApt?.waterMeterReading ?? 0} m³
                  </span>
                </div>

                <div>
                  <label className="block text-ink mb-1 font-medium">
                    Електромер — киловатчаса (kWh)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={elecInput}
                    onChange={(e) => setElecInput(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:outline-none focus:border-mat"
                  />
                  <span className="text-[10px] text-ink/70 mt-0.5 block">
                    Предишно показание: {tenantApt?.electricMeterReading ?? 0} kWh
                  </span>
                </div>
              </div>

              {meterSavedMessage && (
                <div className="p-2.5 rounded-lg bg-stamp-soft border border-stamp text-[11px] text-stamp flex items-center gap-1.5 font-semibold">
                  <Check className="w-4 h-4" />
                  <span>Показанията са запазени успешно!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  onClick={() => setIsMeterModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-ink hover:text-ink"
                >
                  Отказ
                </button>
                <button
                  onClick={handleSaveMeterReadings}
                  className="px-4 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors border border-mat/40"
                >
                  Запази показанията
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bank IBAN Modal */}
        {showIbanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
            <div className="relative w-full max-w-md rounded-2xl bg-sheet border border-line p-6  space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-mat" />
                  <h3 className="text-sm font-bold text-ink">
                    Банкови данни за превод на наем
                  </h3>
                </div>
                <button
                  onClick={() => setShowIbanModal(false)}
                  className="text-ink hover:text-ink p-1 rounded"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-film border border-line space-y-2">
                  <div>
                    <span className="text-[10px] text-ink uppercase">IBAN сметка на хазяина</span>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <code className="text-sm font-tech font-bold text-stamp">
                        {building.iban || 'Собственикът още не е въвел IBAN'}
                      </code>
                      <button
                        disabled={!building.iban}
                        onClick={() => handleCopyIban((building.iban || '').replace(/\s/g, ''))}
                        className="px-2.5 py-1 text-[11px] font-semibold text-white bg-mat hover:bg-mat-deep rounded border border-mat/40 transition-colors"
                      >
                        {copiedIban ? 'Копирано!' : 'Копирай'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-ink">Получател:</span>
                      <div className="font-semibold text-ink">{building.contactManager}</div>
                    </div>
                    <div>
                      <span className="text-ink">Банка:</span>
                      <div className="font-semibold text-ink">{building.bankName || '—'}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line text-[11px]">
                    <span className="text-ink">Основание за плащане:</span>
                    <div className="font-tech text-ink mt-0.5">
                      {myCurrentPayment ? `${myCurrentPayment.title} - Ап. ${myCurrentPayment.apartmentNumber}` : `Наем Ап. ${currentUser.apartmentNumber}`}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-ink">
                  След извършване на превода през мобилното си банкиране, прикачете снимка или PDF на платежното от бутона „Качи платежно / бележка“.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  onClick={() => setShowIbanModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-ink bg-sheet hover:bg-raise rounded-lg border border-line"
                >
                  Затвори
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. AI Daily Summary Banner */}
      <DailySummaryBanner
        role={currentUser.role}
        userName={currentUser.name}
        building={building}
        payments={payments}
        repairTickets={repairTickets}
        calendarEvents={calendarEvents}
        onNavigateTab={onNavigateTab}
      />

      {/* 2. Quick Action Bar - Black canvas with Beige, Greenish & Blue detail actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-sheet border border-line">
        <div className="text-xs font-semibold text-ink flex items-center gap-2">
          <span>Бързо:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenDiagnosisModal && (
            <button
              onClick={onOpenDiagnosisModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors border border-mat/40 shadow-sm"
            >
              <Camera className="w-3.5 h-3.5 text-ink" />
              <span>Снимай повреда</span>
            </button>
          )}
          <button
            onClick={onOpenNewEventModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink hover:text-ink bg-sheet hover:bg-sheet rounded-lg border border-mat transition-colors"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-mat" />
            <span>Запиши в календара</span>
          </button>
          <button
            onClick={onOpenNewTicketModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink hover:text-ink bg-film hover:bg-hi-soft rounded-lg border border-ochre transition-colors"
          >
            <Plus className="w-4 h-4 text-stamp" />
            <span>Нов сигнал</span>
          </button>

          <button
            onClick={() => openAiChatWithPrompt('Кои задачи и плащания изискват внимание днес?')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stamp hover:text-ink bg-stamp-soft hover:bg-stamp-soft rounded-lg border border-stamp transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-stamp" />
            <span>Какво пропускам днес?</span>
          </button>
        </div>
      </div>

      {/* 3. Role-specific Focus or Main Portfolio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Building Twin & Status Overview */}
        <div className="lg:col-span-8 space-y-6">
          {/* The building as its section drawing, with this month's money underneath. */}
          <section className="rounded-[10px] border border-line bg-sheet p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink">{building.name}</h3>
                <p className="text-[13px] text-mute">{building.address}, {building.city} · построена {building.yearBuilt} г.</p>
              </div>
              <Legend />
            </div>
            <SectionDrawing apartments={apartments} payments={payments} repairs={repairTickets} onOpen={onNavigateTab} />
            <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 border-t border-line pt-4">
              <div>
                <dt className="font-tech text-[12px] uppercase tracking-[0.05em] text-mute">Фонд „Ремонт“</dt>
                <dd className="font-tech text-[22px] leading-tight text-ink">{building.reserveFundBalance.toLocaleString('bg-BG')} €</dd>
                <Dim />
              </div>
              <div>
                <dt className="font-tech text-[12px] uppercase tracking-[0.05em] text-mute">Заети</dt>
                <dd className="font-tech text-[22px] leading-tight text-ink">
                  {apartments.length > 0 ? apartments.filter((a) => a.status === 'occupied').length : building.occupiedApartments} от {apartments.length > 0 ? Math.max(building.totalApartments, apartments.length) : building.totalApartments}
                </dd>
                <Dim />
              </div>
              <div>
                <dt className="font-tech text-[12px] uppercase tracking-[0.05em] text-mute">Събрано</dt>
                <dd className="font-tech text-[22px] leading-tight text-ink">
                  {payments.length > 0
                    ? Math.min(100, Math.round((totalCollected / Math.max(1, payments.reduce((s, p) => s + p.amount, 0))) * 100))
                    : building.monthlyCollectionRate}%
                </dd>
                <Dim />
              </div>
              <div>
                <dt className="font-tech text-[12px] uppercase tracking-[0.05em] text-mute">Чака теб</dt>
                <dd className="font-tech text-[22px] leading-tight text-ink">{pendingPayments.length} плащ. · {activeRepairs.length} рем.</dd>
                <Dim />
              </div>
            </dl>
          </section>

          {/* Urgent Items Review Tables */}
          <div className="rounded-2xl border border-line bg-sheet p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-mat" />
                <h4 className="text-sm font-bold text-ink">
                  Плащания за проверка
                </h4>
              </div>
              <button
                onClick={() => onNavigateTab('payments')}
                className="text-xs text-mat hover:text-ink font-medium flex items-center gap-1"
              >
                <span>Виж всички плащания</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {pendingPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-raise/80 hover:bg-hi-soft border border-ochre transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-raise border border-ochre flex items-center justify-center text-ink shrink-0 mt-0.5">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink">
                        {payment.title} · Ап. {payment.apartmentNumber}
                      </div>
                      <div className="text-[11px] text-ink mt-0.5">
                        {payment.tenantName} · Качено платежно бордеро
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold font-tech tabular-nums text-ink">
                        {payment.amount.toLocaleString('bg-BG')} €
                      </div>
                      <span className="text-[10px] text-stamp">Чака потвърждение</span>
                    </div>

                    <button
                      onClick={() => onNavigateTab('payments', payment.id)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors border border-mat/40 whitespace-nowrap shadow-sm"
                    >
                      Прегледай
                    </button>
                  </div>
                </div>
              ))}

              {overduePayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-red-soft/60 hover:bg-red-soft border border-red/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red/10 border border-red/20 flex items-center justify-center text-red shrink-0 mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-ink">
                        {payment.title} · Ап. {payment.apartmentNumber}
                      </div>
                      <div className="text-[11px] text-mute mt-0.5">
                        {payment.tenantName} · Краен срок беше: {payment.dueDate}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold font-tech tabular-nums text-red">
                        {payment.amount.toLocaleString('bg-BG')} €
                      </div>
                      <span className="text-[10px] text-red">Просрочено</span>
                    </div>

                    <button
                      onClick={() => onNavigateTab('payments', payment.id)}
                      className="px-3 py-1.5 text-xs font-medium text-ink hover:text-ink bg-sheet hover:bg-raise rounded-lg border border-mat transition-colors whitespace-nowrap"
                    >
                      Напомняне
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Active Repairs & Upcoming Calendar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Repair Tickets */}
          <div className="rounded-2xl border border-line bg-sheet p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-stamp" />
                <h4 className="text-sm font-bold text-ink">
                  Отворени ремонти ({activeRepairs.length})
                </h4>
              </div>
              <button
                onClick={() => onNavigateTab('repairs')}
                className="text-xs text-stamp hover:text-ink font-medium"
              >
                Виж всички
              </button>
            </div>

            <div className="space-y-3">
              {activeRepairs.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => onNavigateTab('repairs', ticket.id)}
                  className="p-3 rounded-xl bg-sheet/80 hover:bg-sheet border border-line hover:border-line transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-tech text-mat font-semibold">
                      {ticket.ticketNumber}
                    </span>
                    <span className="text-mute">
                      Срок: {ticket.deadlineDate}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-ink group-hover:text-mat transition-colors line-clamp-1">
                    {ticket.title}
                  </div>
                  <div className="text-[11px] text-ink mt-1 flex items-center justify-between">
                    <span>{ticket.locationDetail}</span>
                    <span className="font-tech tabular-nums text-stamp">
                      {ticket.estimatedBudget} €
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Calendar Schedule */}
          <div className="rounded-2xl border border-line bg-sheet p-5">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-mat" />
                <h4 className="text-sm font-bold text-ink">
                  Календар
                </h4>
              </div>
              <button
                onClick={() => onNavigateTab('calendar')}
                className="text-xs text-mat hover:text-ink font-medium"
              >
                Отвори
              </button>
            </div>

            <div className="space-y-2.5">
              {upcomingEvents.map((evt) => {
                const dateObj = new Date(evt.startDateTime);
                const time = dateObj.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={evt.id}
                    onClick={() => onNavigateTab('calendar', evt.id)}
                    className="flex items-start gap-3 p-2.5 rounded-xl bg-sheet/50 hover:bg-sheet border border-line transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg bg-film border border-ochre flex flex-col items-center justify-center text-center shrink-0">
                      <span className="text-[11px] font-bold text-ink leading-none">
                        {dateObj.getDate()}
                      </span>
                      <span className="text-[9px] text-ink uppercase leading-none mt-0.5">
                        {dateObj.toLocaleDateString('bg-BG', { month: 'short' })}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink truncate">
                        {evt.title}
                      </div>
                      <div className="text-[11px] text-ink mt-0.5 flex items-center gap-1.5">
                        <span>{time !== '00:00' ? time + ' ч.' : 'Цял ден'}</span>
                        <span>·</span>
                        <span className="truncate">{evt.assignedToName}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
