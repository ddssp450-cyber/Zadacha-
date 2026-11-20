import React, { useState } from 'react';
import { 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Upload, 
  FileText, 
  Eye, 
  Check, 
  X, 
  Sparkles, 
  Plus, 
  Search, 
  Filter, 
  Receipt, 
  ExternalLink,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { Apartment, Building, PaymentObligation, PaymentStatus, UserRole, UserProfile } from '../types';
import { isoDay, monthLabel, nextMonth } from '../format';
import { DeleteButton } from './PhotoPicker';

interface PaymentsViewProps {
  currentUser: UserProfile;
  payments: PaymentObligation[];
  building: Building;
  apartments: Apartment[];
  onUpdatePayment: (payment: PaymentObligation) => void;
  onCreatePayment: (newPayment: Omit<PaymentObligation, 'id'>) => void;
  onDeletePayment?: (id: string) => void;
  highlightPaymentId?: string;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  currentUser,
  payments,
  building,
  apartments,
  onUpdatePayment,
  onCreatePayment,
  onDeletePayment,
  highlightPaymentId,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedPaymentForReview, setSelectedPaymentForReview] = useState<PaymentObligation | null>(
    highlightPaymentId ? payments.find((p) => p.id === highlightPaymentId) || null : null
  );
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [paymentToUploadFor, setPaymentToUploadFor] = useState<PaymentObligation | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  // New payment form state (for owner)
  const [newApartmentNumber, setNewApartmentNumber] = useState(apartments[0]?.number ?? '');
  const [newTitle, setNewTitle] = useState(`Наем за ${monthLabel(nextMonth())}`);
  const [newAmount, setNewAmount] = useState(apartments[0]?.monthlyRent ?? 0);
  const [newDueDate, setNewDueDate] = useState(isoDay(nextMonth()));
  const [newPeriod, setNewPeriod] = useState(monthLabel(nextMonth()));
  const [newType, setNewType] = useState<'rent' | 'electricity' | 'water' | 'common_fund' | 'repair_fund'>('rent');

  // Upload proof modal state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);

  // Filter payments based on user role and tab filter
  const filteredPayments = payments.filter((p) => {
    // If tenant, they only see their apartment's payments
    if (currentUser.role === 'tenant' && currentUser.apartmentNumber && p.apartmentNumber !== currentUser.apartmentNumber) {
      return false;
    }

    if (filterStatus === 'pending') {
      if (p.status !== 'pending_verification' && p.status !== 'declared_paid') return false;
    } else if (filterStatus === 'overdue') {
      if (p.status !== 'overdue') return false;
    } else if (filterStatus === 'confirmed') {
      if (p.status !== 'confirmed_paid') return false;
    } else if (filterStatus === 'unpaid') {
      if (p.status !== 'unpaid') return false;
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.tenantName.toLowerCase().includes(q) ||
        p.apartmentNumber.includes(q) ||
        p.period.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Calculate totals
  const totalDue = filteredPayments.reduce((acc, p) => acc + p.amount, 0);
  const totalPaid = filteredPayments
    .filter((p) => p.status === 'confirmed_paid')
    .reduce((acc, p) => acc + (p.paidAmount || p.amount), 0);
  const totalPending = filteredPayments
    .filter((p) => p.status === 'pending_verification' || p.status === 'declared_paid')
    .reduce((acc, p) => acc + p.amount, 0);
  const totalOverdue = filteredPayments
    .filter((p) => p.status === 'overdue')
    .reduce((acc, p) => acc + p.amount, 0);

  const getStatusText = (status: PaymentStatus) => {
    switch (status) {
      case 'unpaid': return 'Неплатено';
      case 'declared_paid': return 'Декларирано платено';
      case 'pending_verification': return 'Чака потвърждение';
      case 'confirmed_paid': return 'Платено — потвърдено';
      case 'partially_paid': return 'Частично платено';
      case 'overdue': return 'Просрочено';
      // Unknown values (old rows, AI output) must not crash the page
      default: return String(status ?? '—');
    }
  };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case 'unpaid': return 'text-ink';
      case 'declared_paid':
      case 'pending_verification': return 'text-ink bg-hi-soft px-1.5 py-0.5 rounded border border-dashed border-ink/60';
      case 'confirmed_paid': return 'text-stamp bg-stamp-soft px-1.5 py-0.5 rounded border border-stamp';
      case 'partially_paid': return 'text-mat bg-mat-soft px-1.5 py-0.5 rounded border border-mat';
      case 'overdue': return 'text-red bg-red/20 px-1.5 py-0.5 rounded border border-red/30';
      // Unknown values (old rows, AI output) must not crash the page
      default: return 'text-ink bg-sheet px-1.5 py-0.5 rounded border border-line';
    }
  };

  // Handle Tenant uploading receipt
  const handleSimulateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // shortcut: the proof is stored inline as a data URL, so cap the size; move to file storage for real volume.
      if (file.size > 4 * 1024 * 1024) {
        setUploadError('Файлът е над 4 MB. Качи по-малка снимка или PDF.');
        return;
      }
      setUploadError(null);
      setUploadFile(file);
      // A data URL (not a blob: URL) so the owner can open the proof on their own device.
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setUploadPreview(fileBase64);

      // Real OCR when AI is available; otherwise the owner checks the slip by hand
      setIsAiAnalyzing(true);
      fetch('/api/ai/extract-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mimeType: file.type,
          amountExpected: paymentToUploadFor?.amount,
          expectedReason: paymentToUploadFor && `${paymentToUploadFor.title} - Ап. ${paymentToUploadFor.apartmentNumber}`,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setAiAnalysisResult(data.extractedData);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setIsAiAnalyzing(false));
    }
  };

  const handleSubmitProof = () => {
    if (!paymentToUploadFor) return;

    const updated: PaymentObligation = {
      ...paymentToUploadFor,
      status: 'pending_verification',
      paidAmount: paymentToUploadFor.amount,
      paidAt: new Date().toISOString(),
      proofUrl: uploadPreview || undefined,
      proofType: uploadFile?.type === 'application/pdf' ? 'pdf' : 'image',
      proofExtractedData: aiAnalysisResult || {
        senderName: currentUser.name,
        notes: 'Автоматична проверка не беше направена — провери документа ръчно.',
      },
    };

    onUpdatePayment(updated);
    setIsUploadModalOpen(false);
    setPaymentToUploadFor(null);
    setUploadFile(null);
    setUploadPreview(null);
    setAiAnalysisResult(null);
  };

  // Owner confirmation actions
  const handleConfirmPayment = (payment: PaymentObligation) => {
    const updated: PaymentObligation = {
      ...payment,
      status: 'confirmed_paid',
      confirmedByOwnerAt: new Date().toISOString(),
      notes: (payment.notes || '') + ' · Потвърдено от собственика след проверка на платежното.',
    };
    onUpdatePayment(updated);
    setSelectedPaymentForReview(null);
  };

  const handleRejectPayment = (payment: PaymentObligation, reason: string) => {
    const updated: PaymentObligation = {
      ...payment,
      status: 'unpaid',
      rejectedReason: reason,
      notes: (payment.notes || '') + ` · Отхвърлено: ${reason}`,
    };
    onUpdatePayment(updated);
    setSelectedPaymentForReview(null);
  };

  return (
    <div className="space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            {currentUser.role === 'tenant' 
              ? `Наем и сметки · ап. ${currentUser.apartmentNumber ?? ''}`
              : 'Плащания'}
          </h2>
          <p className="text-xs text-ink mt-0.5">
            {currentUser.role === 'tenant'
              ? 'Колко дължиш, по коя сметка и къде да качиш бордерото'
              : 'Кой е платил, кой е обявил, че е платил, и кой пак закъснява'}
          </p>
        </div>

        {currentUser.role === 'owner' ? (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 text-stamp" />
            <span>Ново задължение</span>
          </button>
        ) : (
          <button
            onClick={() => {
              if (filteredPayments.length > 0) {
                setPaymentToUploadFor(filteredPayments[0]);
                setIsUploadModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4 text-stamp" />
            <span>Качи платежно за наем</span>
          </button>
        )}
      </div>

      {/* Tenant Quick Bank Transfer Box */}
      {currentUser.role === 'tenant' && (
        <div className="p-4 rounded-2xl bg-sheet border border-line shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-semibold text-stamp tracking-wider">
              Данни за банков превод на наем
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink">
              <span className="text-ink">IBAN:</span>
              <code className="font-tech font-bold text-sm text-stamp bg-film px-2 py-0.5 rounded border border-line">
                {building.iban || 'Собственикът още не е въвел IBAN'}
              </code>
              <button
                disabled={!building.iban}
                onClick={() => {
                  navigator.clipboard.writeText((building.iban || '').replace(/\s/g, ''));
                  setCopiedIban(true);
                  setTimeout(() => setCopiedIban(false), 2000);
                }}
                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-mat hover:bg-mat-deep rounded border border-mat/40 transition-colors"
              >
                {copiedIban ? 'Копирано!' : 'Копирай IBAN'}
              </button>
            </div>
            <div className="text-[11px] text-ink">
              Получател: <strong className="text-ink">{building.contactManager}</strong>{building.bankName && <> · Банка: <strong>{building.bankName}</strong></>} · Основание: <strong>Наем Ап. {currentUser.apartmentNumber ?? ''}</strong>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => {
                if (filteredPayments.length > 0) {
                  setPaymentToUploadFor(filteredPayments[0]);
                  setIsUploadModalOpen(true);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-mat hover:bg-mat-deep rounded-xl border border-mat/40 transition-colors shadow-sm"
            >
              <Upload className="w-3.5 h-3.5 text-ink" />
              <span>Прикачи платежно нареждане</span>
            </button>
          </div>
        </div>
      )}

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">
            {currentUser.role === 'tenant' ? 'Потвърдено платено' : 'Потвърдени приходи'}
          </div>
          <div className="text-xl font-bold font-tech tabular-nums text-stamp">
            {totalPaid.toLocaleString('bg-BG')} €
          </div>
          <div className="text-[10px] text-mute mt-1">за текущия период</div>
        </div>

        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">Чакащи потвърждение</div>
          <div className="text-xl font-bold font-tech tabular-nums text-ink">
            {totalPending.toLocaleString('bg-BG')} €
          </div>
          <div className="text-[10px] text-ink mt-1">
            {currentUser.role === 'tenant' ? 'изпратено бордеро за преглед' : 'изискват преглед на бордеро'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">Просрочени суми</div>
          <div className="text-xl font-bold font-tech tabular-nums text-red">
            {totalOverdue.toLocaleString('bg-BG')} €
          </div>
          <div className="text-[10px] text-red/80 mt-1">с автоматични напомняния</div>
        </div>

        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">
            {currentUser.role === 'tenant' ? 'Срок за превод' : 'Фонд Ремонт наличност'}
          </div>
          <div className="text-xl font-bold font-tech tabular-nums text-mat">
            {currentUser.role === 'tenant'
              ? (payments.filter((p) => p.status === 'unpaid' || p.status === 'overdue').map((p) => p.dueDate).sort()[0] ?? '—')
              : `${Math.round(building.reserveFundBalance).toLocaleString('bg-BG')} €`}
          </div>
          <div className="text-[10px] text-mute mt-1">
            {currentUser.role === 'tenant' ? 'месечен краен срок' : 'резервен буфер на сградата'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-sheet border border-line text-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Всички задължения' },
            { id: 'pending', label: 'Чакащи потвърждение' },
            { id: 'overdue', label: 'Просрочени' },
            { id: 'confirmed', label: 'Потвърдени' },
            { id: 'unpaid', label: 'Неплатени' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                filterStatus === tab.id
                  ? 'bg-mat-soft text-mat font-semibold border border-mat/60 shadow-sm'
                  : 'text-ink hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Търси по апартамент или име..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-film border border-line rounded-lg text-xs text-ink placeholder-[#787163] focus:outline-none focus:border-mat w-full sm:w-56"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="rounded-2xl border border-line bg-sheet overflow-hidden ">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-line bg-sheet text-ink text-[11px]">
                <th className="py-3 px-4 font-medium">Апартамент и наемател</th>
                <th className="py-3 px-4 font-medium">Задължение и период</th>
                <th className="py-3 px-4 font-medium text-right">Сума (€)</th>
                <th className="py-3 px-4 font-medium">Краен срок</th>
                <th className="py-3 px-4 font-medium">Статус</th>
                <th className="py-3 px-4 font-medium text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-mute text-xs">
                    Няма намерени плащания по избраните критерии.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const isHighlighted = p.id === highlightPaymentId;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-sheet transition-colors ${
                        isHighlighted ? 'bg-mat/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink">
                          Апартамент {p.apartmentNumber}
                        </div>
                        <div className="text-[11px] text-ink">
                          {p.tenantName}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-ink">
                          {p.title}
                        </div>
                        <div className="text-[11px] text-mute">
                          {p.period}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-tech font-bold tabular-nums text-ink text-sm">
                        {p.amount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
                      </td>

                      <td className="py-3 px-4 text-ink font-tech text-[11px]">
                        {p.dueDate}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={getStatusColor(p.status)}>
                            {getStatusText(p.status)}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {/* If tenant and unpaid, allow upload */}
                        {currentUser.role === 'tenant' && (p.status === 'unpaid' || p.status === 'overdue') && (
                          <button
                            onClick={() => {
                              setPaymentToUploadFor(p);
                              setIsUploadModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-md transition-colors border border-mat/40 shadow-sm"
                          >
                            <Upload className="w-3 h-3 text-stamp" />
                            <span>Плати / Качи</span>
                          </button>
                        )}

                        {/* If tenant and pending */}
                        {currentUser.role === 'tenant' && p.status === 'pending_verification' && (
                          <span className="text-[11px] text-ink italic">
                            Чака потвърждение от собственик
                          </span>
                        )}

                        {/* If owner and pending verification, show review button */}
                        {currentUser.role === 'owner' && (p.status === 'pending_verification' || p.status === 'declared_paid') && (
                          <button
                            onClick={() => setSelectedPaymentForReview(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-md transition-colors border border-mat/40 shadow-sm"
                          >
                            <Eye className="w-3 h-3 text-mat" />
                            <span>Прегледай платежно</span>
                          </button>
                        )}

                        {/* Confirmed paid */}
                        {p.status === 'confirmed_paid' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-stamp">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Потвърдено</span>
                          </span>
                        )}
                        {currentUser.role === 'owner' && onDeletePayment && (
                          <DeleteButton className="mt-1 !px-2 !py-0.5 !text-[10px]" onDelete={() => onDeletePayment(p.id)} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Proof Modal (For Owner) */}
      {selectedPaymentForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-2xl rounded-2xl bg-sheet border border-line p-6  space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-ochre" />
                <h3 className="text-base font-bold text-ink">
                  Проверка на платежно доказателство: Ап. {selectedPaymentForReview.apartmentNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPaymentForReview(null)}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Document Screenshot */}
              <div className="rounded-xl border border-line bg-film p-2 overflow-hidden flex flex-col justify-center items-center">
                {selectedPaymentForReview.proofUrl ? (
                  <img
                    src={selectedPaymentForReview.proofUrl}
                    alt="Платежно нареждане"
                    className="max-h-72 w-auto object-contain rounded-lg"
                  />
                ) : (
                  <div className="py-12 text-center text-mute text-xs">
                    Няма прикачено изображение
                  </div>
                )}
                <div className="mt-2 text-[10px] text-mute">
                  Документ: Банково бордеро / Скрийншот
                </div>
              </div>

              {/* Right: AI OCR & Extracted fields */}
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-hi/10 border border-ochre/20 text-ink space-y-1.5">
                  <div className="flex items-center gap-1.5 text-ochre font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Извличане на данни (OCR)</span>
                  </div>
                  <div className="text-[11px] text-ink">
                    {selectedPaymentForReview.proofExtractedData?.notes ||
                      'AI потвърди валидността на банковия документ.'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-raise/40 border border-line space-y-2">
                  <div className="flex justify-between">
                    <span className="text-mute">Дължима сума:</span>
                    <span className="font-tech font-bold text-ink">
                      {selectedPaymentForReview.amount} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute">Разпозната сума в документа:</span>
                    <span className="font-tech font-bold text-stamp">
                      {selectedPaymentForReview.proofExtractedData?.detectedAmount || selectedPaymentForReview.amount} €
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute">Наредител:</span>
                    <span className="text-ink font-medium">
                      {selectedPaymentForReview.proofExtractedData?.senderName || selectedPaymentForReview.tenantName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute">Референтен №:</span>
                    <span className="font-tech text-ink">
                      {selectedPaymentForReview.proofExtractedData?.referenceNumber || 'TXN-984210'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-mute">Основание:</span>
                    <span className="text-ink">
                      {selectedPaymentForReview.proofExtractedData?.paymentReason || selectedPaymentForReview.title}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-mute italic">
                  * Забележка: AI подготвя данните за бърз преглед, но съгласно правилата крайното одобрение е изцяло във вашите ръце.
                </div>
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={() => handleRejectPayment(selectedPaymentForReview, 'Несъответствие в платежното нареждане')}
                className="px-4 py-2 text-xs font-medium text-red hover:text-red hover:bg-red/30 rounded-lg border border-red/30 transition-colors"
              >
                Отхвърли плащането
              </button>
              <button
                onClick={() => handleConfirmPayment(selectedPaymentForReview)}
                className="px-4 py-2 text-xs font-semibold text-white bg-stamp hover:bg-stamp rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>Потвърди плащането</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Upload Proof Modal */}
      {isUploadModalOpen && paymentToUploadFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6  space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-ochre" />
                <h3 className="text-base font-bold text-ink">
                  Качи платежно за: {paymentToUploadFor.title}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setPaymentToUploadFor(null);
                }}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-raise/40 border border-line text-xs flex justify-between">
              <div>
                <span className="text-mute block text-[11px]">Дължима сума:</span>
                <span className="text-base font-bold font-tech text-ink">
                  {paymentToUploadFor.amount} €
                </span>
              </div>
              <div className="text-right">
                <span className="text-mute block text-[11px]">Краен срок:</span>
                <span className="text-ink font-tech">
                  {paymentToUploadFor.dueDate}
                </span>
              </div>
            </div>

            {/* Upload Drag & Drop Area */}
            <div className="border-2 border-dashed border-rule hover:border-ochre/50 rounded-xl p-6 text-center transition-colors">
              <input
                type="file"
                id="receipt-file"
                accept="image/*,application/pdf"
                onChange={handleSimulateUpload}
                className="hidden"
              />
              {uploadError && <p role="alert" className="text-red text-xs mb-2">{uploadError}</p>}
              <label htmlFor="receipt-file" className="cursor-pointer block">
                <Upload className="w-8 h-8 text-ochre mx-auto mb-2" />
                <span className="text-xs font-semibold text-ink block">
                  Кликнете за избор на платежно нареждане (Снимка или PDF)
                </span>
                <span className="text-[11px] text-mute mt-1 block">
                  PNG, JPG, PDF до 10MB
                </span>
              </label>

              {uploadFile && (
                <div className="mt-3 p-2 bg-raise rounded-lg text-xs text-ochre font-tech truncate">
                  Избран файл: {uploadFile.name}
                </div>
              )}
            </div>

            {isAiAnalyzing && (
              <div className="p-3 rounded-xl bg-raise/60 border border-ochre/30 flex items-center gap-3 text-xs text-ochre animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin text-ochre" />
                <span>Building Brain AI сканира документа и извлича сумата...</span>
              </div>
            )}

            {aiAnalysisResult && (
              <div className="p-3 rounded-xl bg-stamp/20 border border-stamp/30 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-stamp font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>AI потвърди документа: {aiAnalysisResult.detectedAmount} €</span>
                </div>
                <div className="text-[11px] text-ink">
                  {aiAnalysisResult.notes}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setPaymentToUploadFor(null);
                }}
                className="px-4 py-2 text-xs font-medium text-mute hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={handleSubmitProof}
                className="px-4 py-2 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors shadow-sm"
              >
                Изпрати за потвърждение
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner Create New Payment Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6  space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-bold text-ink">
                Ново месечно задължение
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-mute mb-1">Апартамент</label>
                <select
                  value={newApartmentNumber}
                  onChange={(e) => setNewApartmentNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                >
                  {apartments.map((a) => (
                    <option key={a.id} value={a.number}>
                      Апартамент {a.number}{a.tenantName ? ` · ${a.tenantName}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-mute mb-1">Вид задължение</label>
                <select
                  value={newType}
                  onChange={(e: any) => setNewType(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                >
                  <option value="rent">Месечен Наем</option>
                  <option value="common_fund">Такса Общи Части</option>
                  <option value="repair_fund">Фонд Ремонт и Обновяване</option>
                  <option value="electricity">Електричество</option>
                  <option value="water">Вода</option>
                </select>
              </div>

              <div>
                <label className="block text-mute mb-1">Заглавие</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-mute mb-1">Сума (€)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink font-tech"
                  />
                </div>
                <div>
                  <label className="block text-mute mb-1">Краен срок</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink font-tech"
                  />
                </div>
              </div>

              <div>
                <label className="block text-mute mb-1">Период</label>
                <input
                  type="text"
                  value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-mute hover:text-ink"
              >
                Отказ
              </button>
              <button
                disabled={!newApartmentNumber}
                onClick={() => {
                  const apt = apartments.find((a) => a.number === newApartmentNumber);
                  onCreatePayment({
                    buildingId: currentUser.buildingId,
                    apartmentId: apt?.id ?? `apt-${newApartmentNumber}`,
                    apartmentNumber: newApartmentNumber,
                    tenantId: apt?.tenantId ?? '',
                    tenantName: apt?.tenantName || `Наемател Ап. ${newApartmentNumber}`,
                    title: newTitle,
                    type: newType,
                    amount: newAmount,
                    dueDate: newDueDate,
                    period: newPeriod,
                    status: 'unpaid',
                  });
                  setIsCreateModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-ink bg-hi hover:bg-hi rounded-lg transition-colors shadow-sm"
              >
                Запази задължението
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
