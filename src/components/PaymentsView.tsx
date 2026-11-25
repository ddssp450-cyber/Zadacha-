import React, { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  Upload,
  Eye,
  Check,
  X,
  Sparkles,
  Plus,
  Search,
  Receipt,
  Building2,
  Edit3,
  Copy,
  FileText,
  Download,
} from 'lucide-react';
import { Apartment, Building, PaymentObligation, PaymentStatus, UserProfile } from '../types';
import { isoDay, monthLabel, nextMonth } from '../format';
import { DeleteButton, fileToBoundedDataUrl } from './PhotoPicker';
import { getAuthHeaders } from '../lib/apiClient';

type PaymentType = PaymentObligation['type'];

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  rent: 'Месечен наем',
  common_fund: 'Такса общи части',
  repair_fund: 'Фонд „Ремонт“',
  electricity: 'Електричество',
  water: 'Вода',
};

const DEFAULT_TITLES: Record<PaymentType, string> = {
  rent: 'Месечен наем',
  common_fund: 'Такса общи части',
  repair_fund: 'Вноска Фонд „Ремонт“',
  electricity: 'Сметка електричество',
  water: 'Сметка вода',
};

interface PaymentsViewProps {
  currentUser: UserProfile;
  payments: PaymentObligation[];
  building: Building;
  apartments: Apartment[];
  onUpdatePayment: (payment: PaymentObligation) => void;
  onCreatePayment: (newPayment: Omit<PaymentObligation, 'id'>) => void;
  onDeletePayment?: (id: string) => void;
  onUpdateBankDetails?: (fields: { iban: string; bankName: string; contactManager: string }) => Promise<unknown>;
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
  onUpdateBankDetails,
  highlightPaymentId,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedPaymentForReview, setSelectedPaymentForReview] = useState<PaymentObligation | null>(
    highlightPaymentId ? payments.find((p) => p.id === highlightPaymentId) || null : null
  );
  const [reviewPaidAmount, setReviewPaidAmount] = useState<number>(0);
  const [reviewNote, setReviewNote] = useState<string>('');

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [paymentToUploadFor, setPaymentToUploadFor] = useState<PaymentObligation | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  // Bank account edit state (for owner)
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [bankIban, setBankIban] = useState(building.iban || '');
  const [bankName, setBankName] = useState(building.bankName || '');
  const [bankRecipient, setBankRecipient] = useState(building.contactManager || '');
  const [bankSaving, setBankSaving] = useState(false);
  const [bankFeedback, setBankFeedback] = useState<string | null>(null);

  // New payment form state (for owner)
  const [createScope, setCreateScope] = useState<'single' | 'all_apartments'>('single');
  const [newApartmentNumber, setNewApartmentNumber] = useState(apartments[0]?.number ?? '');
  const [newType, setNewType] = useState<PaymentType>('rent');
  const [newPeriod, setNewPeriod] = useState(monthLabel(nextMonth()));
  const [newTitle, setNewTitle] = useState(`Месечен наем — ${monthLabel(nextMonth())}`);
  const [newAmount, setNewAmount] = useState<number>(apartments[0]?.monthlyRent ?? 0);
  const [newDueDate, setNewDueDate] = useState(isoDay(nextMonth()));

  // Upload proof / declare payment modal state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPaidAmount, setUploadPaidAmount] = useState<number>(0);
  const [uploadReference, setUploadReference] = useState<string>('');
  const [uploadNote, setUploadNote] = useState<string>('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);

  const openBankEditor = () => {
    setBankIban(building.iban || '');
    setBankName(building.bankName || '');
    setBankRecipient(building.contactManager || '');
    setBankFeedback(null);
    setIsEditingBank(true);
  };

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateBankDetails) return;
    setBankSaving(true);
    setBankFeedback(null);
    try {
      await onUpdateBankDetails({
        iban: bankIban.trim().toUpperCase(),
        bankName: bankName.trim(),
        contactManager: bankRecipient.trim(),
      });
      setIsEditingBank(false);
      setBankFeedback('Банковата сметка е запазена успешно.');
      setTimeout(() => setBankFeedback(null), 3000);
    } catch (err) {
      setBankFeedback(err instanceof Error ? err.message : 'Грешка при запис на сметката.');
    } finally {
      setBankSaving(false);
    }
  };

  const openCreateModal = () => {
    const defaultApt = apartments[0];
    const nextPeriod = monthLabel(nextMonth());
    setCreateScope('single');
    setNewApartmentNumber(defaultApt?.number ?? '');
    setNewType('rent');
    setNewPeriod(nextPeriod);
    setNewTitle(`${DEFAULT_TITLES.rent} — ${nextPeriod}`);
    setNewAmount(defaultApt?.monthlyRent ?? 0);
    setNewDueDate(isoDay(nextMonth()));
    setIsCreateModalOpen(true);
  };

  const handleTypeOrAptChange = (type: PaymentType, aptNum: string, periodStr: string) => {
    setNewType(type);
    setNewApartmentNumber(aptNum);
    setNewTitle(`${DEFAULT_TITLES[type]} — ${periodStr}`);
    const apt = apartments.find((a) => a.number === aptNum);
    if (type === 'rent' && apt?.monthlyRent) {
      setNewAmount(apt.monthlyRent);
    } else if (type === 'common_fund' && apt?.monthlyMaintenanceFee) {
      setNewAmount(apt.monthlyMaintenanceFee);
    }
  };

  const openUploadModalFor = (p: PaymentObligation) => {
    setPaymentToUploadFor(p);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadError(null);
    setUploadPaidAmount(p.amount);
    setUploadReference('');
    setUploadNote('');
    setAiAnalysisResult(null);
    setIsUploadModalOpen(true);
  };

  const openReviewModalFor = (p: PaymentObligation) => {
    setSelectedPaymentForReview(p);
    setReviewPaidAmount(p.proofExtractedData?.detectedAmount || p.paidAmount || p.amount);
    setReviewNote('');
  };

  // Filter payments based on user role, status, type, and search
  const filteredPayments = payments.filter((p) => {
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
      if (p.status !== 'unpaid' && p.status !== 'partially_paid') return false;
    }

    if (filterType !== 'all' && p.type !== filterType) {
      return false;
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.tenantName.toLowerCase().includes(q) ||
        p.apartmentNumber.toLowerCase().includes(q) ||
        p.period.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const nextActionableTenantPayment =
    filteredPayments.find((p) => p.status === 'unpaid' || p.status === 'overdue' || p.status === 'partially_paid') ??
    filteredPayments.find((p) => p.status !== 'confirmed_paid');

  // Calculate totals
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
      default: return String(status ?? '—');
    }
  };

  const getStatusColor = (status: PaymentStatus) => {
    switch (status) {
      case 'unpaid': return 'text-ink bg-film px-1.5 py-0.5 rounded border border-line';
      case 'declared_paid':
      case 'pending_verification': return 'text-ink bg-hi-soft px-1.5 py-0.5 rounded border border-dashed border-ink/60';
      case 'confirmed_paid': return 'text-stamp bg-stamp-soft px-1.5 py-0.5 rounded border border-stamp';
      case 'partially_paid': return 'text-mat bg-mat-soft px-1.5 py-0.5 rounded border border-mat';
      case 'overdue': return 'text-red bg-red/20 px-1.5 py-0.5 rounded border border-red/30';
      default: return 'text-ink bg-sheet px-1.5 py-0.5 rounded border border-line';
    }
  };

  // Handle Tenant uploading receipt
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isPdf = file.type === 'application/pdf';
      if (isPdf && file.size > 400 * 1024) {
        setUploadError('PDF документът е над 400 KB. Качи по-малък PDF или снимка.');
        return;
      }
      if (!isPdf && file.size > 10 * 1024 * 1024) {
        setUploadError('Файлът е над 10 MB. Качи по-малка снимка.');
        return;
      }
      setUploadError(null);
      setUploadFile(file);

      let fileBase64: string;
      let mimeType = file.type;
      try {
        if (isPdf) {
          fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } else {
          fileBase64 = await fileToBoundedDataUrl(file, 1200, 450000);
          mimeType = 'image/jpeg';
        }
      } catch {
        setUploadError('Файлът не можа да бъде обработен. Опитай с JPG или PNG.');
        return;
      }
      setUploadPreview(fileBase64);

      // Real OCR when AI is available; otherwise the owner checks the slip by hand
      setIsAiAnalyzing(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/ai/extract-receipt', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileBase64,
            mimeType,
            amountExpected: paymentToUploadFor?.amount,
            expectedReason: paymentToUploadFor && `${paymentToUploadFor.title} - Ап. ${paymentToUploadFor.apartmentNumber}`,
          }),
        });
        const data = await res.json();
        if (data.success && data.extractedData) {
          setAiAnalysisResult(data.extractedData);
          if (data.extractedData.detectedAmount) {
            setUploadPaidAmount(Number(data.extractedData.detectedAmount) || paymentToUploadFor?.amount || 0);
          }
          if (data.extractedData.referenceNumber) {
            setUploadReference(String(data.extractedData.referenceNumber));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsAiAnalyzing(false);
      }
    }
  };

  const handleSubmitProof = () => {
    if (!paymentToUploadFor) return;

    // Must use status 'pending_verification' and only tenant-allowed fields per firestore.rules
    const updated: PaymentObligation = {
      ...paymentToUploadFor,
      status: 'pending_verification',
      paidAmount: Number(uploadPaidAmount) || paymentToUploadFor.amount,
      paidAt: new Date().toISOString(),
      proofUrl: uploadPreview || undefined,
      proofType: uploadPreview ? (uploadFile?.type === 'application/pdf' ? 'pdf' : 'image') : undefined,
      proofExtractedData: {
        senderName: aiAnalysisResult?.senderName || currentUser.name,
        referenceNumber: uploadReference.trim() || aiAnalysisResult?.referenceNumber || undefined,
        paymentReason: aiAnalysisResult?.paymentReason || `${paymentToUploadFor.title} · Ап. ${paymentToUploadFor.apartmentNumber}`,
        detectedAmount: Number(uploadPaidAmount) || aiAnalysisResult?.detectedAmount || paymentToUploadFor.amount,
        notes:
          uploadNote.trim() ||
          aiAnalysisResult?.notes ||
          (uploadPreview ? 'Качено платежно за преглед от собственика.' : 'Декларирано плащане без прикачен файл — провери банковото извлечение.'),
      },
    };

    onUpdatePayment(updated);
    setIsUploadModalOpen(false);
    setPaymentToUploadFor(null);
    setUploadFile(null);
    setUploadPreview(null);
    setAiAnalysisResult(null);
  };

  // Owner confirmation / partial / rejection actions
  const handleConfirmPayment = (payment: PaymentObligation, partial = false) => {
    const confirmedAmt = Number(reviewPaidAmount) || payment.paidAmount || payment.amount;
    const noteSuffix = reviewNote.trim()
      ? ` · ${reviewNote.trim()}`
      : partial
        ? ` · Частично потвърдено (${confirmedAmt} €)`
        : ' · Потвърдено от собственика.';
    const updated: PaymentObligation = {
      ...payment,
      status: partial ? 'partially_paid' : 'confirmed_paid',
      paidAmount: confirmedAmt,
      paidAt: payment.paidAt || new Date().toISOString(),
      confirmedByOwnerAt: partial ? undefined : new Date().toISOString(),
      notes: `${payment.notes ? payment.notes : ''}${noteSuffix}`.trim(),
    };
    onUpdatePayment(updated);
    setSelectedPaymentForReview(null);
  };

  const handleRejectPayment = (payment: PaymentObligation) => {
    const reason = reviewNote.trim() || 'Несъответствие в платежното нареждане';
    const updated: PaymentObligation = {
      ...payment,
      status: 'unpaid',
      rejectedReason: reason,
      notes: `${payment.notes ? payment.notes + ' · ' : ''}Отхвърлено: ${reason}`,
    };
    onUpdatePayment(updated);
    setSelectedPaymentForReview(null);
  };

  const handleCreateObligations = () => {
    if (createScope === 'all_apartments') {
      const occupied = apartments.filter((a) => a.status === 'occupied');
      const targets = occupied.length > 0 ? occupied : apartments;
      for (const apt of targets) {
        const computedAmount =
          newAmount > 0
            ? newAmount
            : newType === 'rent'
              ? apt.monthlyRent
              : newType === 'common_fund'
                ? apt.monthlyMaintenanceFee
                : 0;
        if (computedAmount <= 0) continue;
        onCreatePayment({
          buildingId: currentUser.buildingId,
          apartmentId: apt.id,
          apartmentNumber: apt.number,
          tenantId: apt.tenantId ?? '',
          tenantName: apt.tenantName || `Ап. ${apt.number}`,
          title: newTitle.trim() || DEFAULT_TITLES[newType],
          type: newType,
          amount: computedAmount,
          dueDate: newDueDate,
          period: newPeriod,
          status: 'unpaid',
        });
      }
      setIsCreateModalOpen(false);
      return;
    }

    const cleanApt = newApartmentNumber.trim();
    if (!cleanApt || newAmount <= 0) return;
    const apt = apartments.find((a) => a.number === cleanApt);
    onCreatePayment({
      buildingId: currentUser.buildingId,
      apartmentId: apt?.id ?? `apt-${cleanApt}`,
      apartmentNumber: cleanApt,
      tenantId: apt?.tenantId ?? '',
      tenantName: apt?.tenantName || `Наемател Ап. ${cleanApt}`,
      title: newTitle.trim() || DEFAULT_TITLES[newType],
      type: newType,
      amount: Number(newAmount),
      dueDate: newDueDate,
      period: newPeriod,
      status: 'unpaid',
    });
    setIsCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            {currentUser.role === 'tenant'
              ? `Наем, фондове и сметки · ап. ${currentUser.apartmentNumber ?? ''}`
              : 'Плащания — наем, фондове и сметки'}
          </h2>
          <p className="text-xs text-ink mt-0.5">
            {currentUser.role === 'tenant'
              ? 'Банкова сметка на сградата, дължими вноски и качване на платежно нареждане'
              : 'Въведи банкова сметка (IBAN), създавай задължения за наем/фондове и проверявай преводи'}
          </p>
        </div>

        {currentUser.role === 'owner' ? (
          <div className="flex flex-wrap items-center gap-2">
            {onUpdateBankDetails && (
              <button
                onClick={openBankEditor}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-ink bg-sheet hover:bg-raise rounded-lg border border-rule transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-mat" />
                <span>{building.iban ? 'Редактирай IBAN' : 'Въведи сметка (IBAN)'}</span>
              </button>
            )}
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 text-stamp" />
              <span>Ново задължение</span>
            </button>
          </div>
        ) : (
          <button
            disabled={!nextActionableTenantPayment}
            onClick={() => nextActionableTenantPayment && openUploadModalFor(nextActionableTenantPayment)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg border border-mat/40 transition-colors shadow-sm disabled:opacity-50"
          >
            <Upload className="w-4 h-4 text-stamp" />
            <span>{nextActionableTenantPayment ? 'Плати / Качи платежно' : 'Няма неплатени задължения'}</span>
          </button>
        )}
      </div>

      {/* Owner Bank Account Card */}
      {currentUser.role === 'owner' && (
        <div className="p-4 rounded-2xl bg-sheet border border-line space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-mat" />
                <span className="text-[11px] uppercase font-semibold text-mat tracking-wider">
                  Банкова сметка на сградата / собственика за преводи
                </span>
              </div>
              {building.iban ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink">
                  <span className="text-mute">IBAN:</span>
                  <code className="font-tech font-bold text-sm text-stamp bg-film px-2 py-0.5 rounded border border-line">
                    {building.iban}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText((building.iban || '').replace(/\s/g, ''));
                      setCopiedIban(true);
                      setTimeout(() => setCopiedIban(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-ink bg-raise hover:bg-rule rounded border border-rule"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedIban ? 'Копирано!' : 'Копирай'}</span>
                  </button>
                  {building.bankName && <span className="text-mute">· Банка: <b className="text-ink">{building.bankName}</b></span>}
                  {building.contactManager && <span className="text-mute">· Получател: <b className="text-ink">{building.contactManager}</b></span>}
                </div>
              ) : (
                <p className="text-xs text-mute">
                  Още не е въведен IBAN. Добави сметката си, за да я виждат наемателите при плащане на наем, фонд „Ремонт“ и такси.
                </p>
              )}
            </div>

            {onUpdateBankDetails && !isEditingBank && (
              <button
                type="button"
                onClick={openBankEditor}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink bg-raise hover:bg-rule rounded-lg border border-rule transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-mat" />
                <span>{building.iban ? 'Промени сметката' : 'Вкарай IBAN сметка'}</span>
              </button>
            )}
          </div>

          {bankFeedback && (
            <div className="text-xs text-stamp font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{bankFeedback}</span>
            </div>
          )}

          {isEditingBank && (
            <form onSubmit={handleSaveBankDetails} className="pt-3 border-t border-line grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-mute mb-1">IBAN сметка</label>
                <input
                  type="text"
                  required
                  value={bankIban}
                  onChange={(e) => setBankIban(e.target.value)}
                  placeholder="BG80 BNBG 9661 1020 3456 78"
                  className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink font-tech"
                />
              </div>
              <div>
                <label className="block text-mute mb-1">Банка</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Напр.: УниКредит Булбанк / ДСК"
                  className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink"
                />
              </div>
              <div>
                <label className="block text-mute mb-1">Титуляр / Получател</label>
                <input
                  type="text"
                  value={bankRecipient}
                  onChange={(e) => setBankRecipient(e.target.value)}
                  placeholder="Име на собственик или ЕС"
                  className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink"
                />
              </div>
              <div className="md:col-span-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingBank(false)}
                  className="px-3 py-1.5 text-xs text-mute hover:text-ink"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  disabled={bankSaving || !bankIban.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg disabled:opacity-50"
                >
                  {bankSaving ? 'Записване…' : 'Запази сметката'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tenant Quick Bank Transfer Box */}
      {currentUser.role === 'tenant' && (
        <div className="p-4 rounded-2xl bg-sheet border border-line shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-semibold text-stamp tracking-wider">
              Данни за банков превод (наем, фондове и такси)
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink">
              <span className="text-ink">IBAN:</span>
              <code className="font-tech font-bold text-sm text-stamp bg-film px-2 py-0.5 rounded border border-line">
                {building.iban || 'Собственикът още не е въвел IBAN'}
              </code>
              <button
                disabled={!building.iban}
                onClick={() => {
                  navigator.clipboard?.writeText((building.iban || '').replace(/\s/g, ''));
                  setCopiedIban(true);
                  setTimeout(() => setCopiedIban(false), 2000);
                }}
                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-mat hover:bg-mat-deep rounded border border-mat/40 transition-colors disabled:opacity-40"
              >
                {copiedIban ? 'Копирано!' : 'Копирай IBAN'}
              </button>
            </div>
            <div className="text-[11px] text-ink">
              Получател: <strong className="text-ink">{building.contactManager || 'Управител'}</strong>
              {building.bankName && <> · Банка: <strong>{building.bankName}</strong></>} · Основание: <strong>Ап. {currentUser.apartmentNumber ?? ''}</strong>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              disabled={!nextActionableTenantPayment}
              onClick={() => nextActionableTenantPayment && openUploadModalFor(nextActionableTenantPayment)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-mat hover:bg-mat-deep rounded-xl border border-mat/40 transition-colors shadow-sm disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-stamp" />
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
          <div className="text-[10px] text-mute mt-1">за избрания филтър</div>
        </div>

        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">Чакащи потвърждение</div>
          <div className="text-xl font-bold font-tech tabular-nums text-ink">
            {totalPending.toLocaleString('bg-BG')} €
          </div>
          <div className="text-[10px] text-ink mt-1">
            {currentUser.role === 'tenant' ? 'изпратено за проверка' : 'изискват преглед от теб'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">Просрочени суми</div>
          <div className="text-xl font-bold font-tech tabular-nums text-red">
            {totalOverdue.toLocaleString('bg-BG')} €
          </div>
          <div className="text-[10px] text-red/80 mt-1">изискват внимание</div>
        </div>

        <div className="p-4 rounded-xl bg-sheet border border-line">
          <div className="text-[11px] text-ink mb-1">
            {currentUser.role === 'tenant' ? 'Следващ краен срок' : 'Фонд „Ремонт“ наличност'}
          </div>
          <div className="text-xl font-bold font-tech tabular-nums text-mat">
            {currentUser.role === 'tenant'
              ? (nextActionableTenantPayment?.dueDate ?? '—')
              : `${Math.round(building.reserveFundBalance).toLocaleString('bg-BG')} €`}
          </div>
          <div className="text-[10px] text-mute mt-1">
            {currentUser.role === 'tenant' ? 'следващо дължимо плащане' : 'попълва се автоматично при потвърден фонд'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-xl bg-sheet border border-line text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'Всички' },
              { id: 'pending', label: 'За проверка' },
              { id: 'unpaid', label: 'Неплатени' },
              { id: 'overdue', label: 'Просрочени' },
              { id: 'confirmed', label: 'Потвърдени' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  filterStatus === tab.id
                    ? 'bg-mat-soft text-mat font-semibold border border-mat/60 shadow-sm'
                    : 'text-ink hover:bg-raise'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <select
            aria-label="Филтър по вид задължение"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2.5 py-1.5 bg-film border border-line rounded-lg text-xs text-ink"
          >
            <option value="all">Всички видове (наем, фондове, сметки)</option>
            <option value="rent">Само наеми</option>
            <option value="repair_fund">Фонд „Ремонт“</option>
            <option value="common_fund">Такса общи части</option>
            <option value="electricity">Електричество</option>
            <option value="water">Вода</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Търси по апартамент, име или период..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-film border border-line rounded-lg text-xs text-ink placeholder-[#787163] focus:outline-none focus:border-mat w-full lg:w-64"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="rounded-2xl border border-line bg-sheet overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-line bg-sheet text-ink text-[11px]">
                <th className="py-3 px-4 font-medium">Апартамент и наемател</th>
                <th className="py-3 px-4 font-medium">Задължение, фонд и период</th>
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
                  const canOwnerAct = currentUser.role === 'owner' && p.status !== 'confirmed_paid';
                  const isPendingReview = p.status === 'pending_verification' || p.status === 'declared_paid';

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-raise/40 transition-colors ${isHighlighted ? 'bg-mat/20' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink">
                          Апартамент {p.apartmentNumber}
                        </div>
                        <div className="text-[11px] text-mute">
                          {p.tenantName}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-ink">{p.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-film border border-line text-mute">
                            {PAYMENT_TYPE_LABELS[p.type] || p.type}
                          </span>
                        </div>
                        <div className="text-[11px] text-mute mt-0.5">
                          {p.period}
                          {p.rejectedReason && p.status === 'unpaid' && (
                            <span className="text-red ml-2">· Отхвърлено: {p.rejectedReason}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-tech font-bold tabular-nums text-ink text-sm">
                        {p.amount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
                        {p.status === 'partially_paid' && p.paidAmount !== undefined && (
                          <div className="text-[10px] font-normal text-mat">
                            Платено: {p.paidAmount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-ink font-tech text-[11px]">
                        {p.dueDate}
                      </td>

                      <td className="py-3 px-4">
                        <span className={getStatusColor(p.status)}>
                          {getStatusText(p.status)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {/* Tenant actions */}
                          {currentUser.role === 'tenant' && (p.status === 'unpaid' || p.status === 'overdue' || p.status === 'partially_paid') && (
                            <button
                              onClick={() => openUploadModalFor(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-md transition-colors border border-mat/40 shadow-sm"
                            >
                              <Upload className="w-3 h-3 text-stamp" />
                              <span>Плати / Качи</span>
                            </button>
                          )}

                          {currentUser.role === 'tenant' && (p.status === 'pending_verification' || p.status === 'declared_paid') && (
                            <span className="text-[11px] text-ink italic inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Чака преглед
                            </span>
                          )}

                          {/* Owner actions */}
                          {canOwnerAct && (
                            <button
                              onClick={() => openReviewModalFor(p)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors shadow-sm ${
                                isPendingReview
                                  ? 'text-white bg-mat hover:bg-mat-deep border border-mat/40'
                                  : 'text-ink bg-raise hover:bg-rule border border-rule'
                              }`}
                            >
                              <Eye className="w-3 h-3" />
                              <span>{isPendingReview ? 'Прегледай платежно' : 'Провери / Отбележи'}</span>
                            </button>
                          )}

                          {/* Confirmed paid */}
                          {p.status === 'confirmed_paid' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-stamp font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Потвърдено</span>
                            </span>
                          )}

                          {currentUser.role === 'owner' && onDeletePayment && (
                            <DeleteButton className="!px-2 !py-0.5 !text-[10px]" onDelete={() => onDeletePayment(p.id)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review / Confirm Payment Modal (For Owner) */}
      {selectedPaymentForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl bg-sheet border border-line p-6 space-y-5 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-ochre" />
                <h3 className="text-base font-bold text-ink">
                  Проверка и потвърждаване: Ап. {selectedPaymentForReview.apartmentNumber} · {PAYMENT_TYPE_LABELS[selectedPaymentForReview.type]}
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
              {/* Left: Document Screenshot or PDF */}
              <div className="rounded-xl border border-line bg-film p-3 overflow-hidden flex flex-col justify-center items-center">
                {selectedPaymentForReview.proofUrl ? (
                  selectedPaymentForReview.proofType === 'pdf' || selectedPaymentForReview.proofUrl.startsWith('data:application/pdf') ? (
                    <div className="w-full space-y-2 text-center">
                      <iframe
                        src={selectedPaymentForReview.proofUrl}
                        title="Платежно нареждане PDF"
                        className="w-full h-60 rounded-lg border border-line bg-white"
                      />
                      <a
                        href={selectedPaymentForReview.proofUrl}
                        download={`platejno-ap-${selectedPaymentForReview.apartmentNumber}.pdf`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-mat rounded-lg"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Изтегли PDF</span>
                      </a>
                    </div>
                  ) : (
                    <img
                      src={selectedPaymentForReview.proofUrl}
                      alt="Платежно нареждане"
                      className="max-h-72 w-auto object-contain rounded-lg"
                    />
                  )
                ) : (
                  <div className="py-10 px-4 text-center text-mute text-xs space-y-2">
                    <FileText className="w-8 h-8 mx-auto opacity-50" />
                    <div>Няма прикачен документ към това задължение.</div>
                    <div className="text-[11px]">Можеш да потвърдиш плащането директно след проверка в банковата ти сметка или при плащане в брой.</div>
                  </div>
                )}
              </div>

              {/* Right: Extracted fields & confirmation controls */}
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-hi/10 border border-ochre/20 text-ink space-y-1">
                  <div className="flex items-center gap-1.5 text-ochre font-semibold text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Данни от платежното</span>
                  </div>
                  <div className="text-[11px] text-ink">
                    {selectedPaymentForReview.proofExtractedData?.notes ||
                      'Сравни сумата и основанието с банковата ти сметка преди потвърждаване.'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-raise/40 border border-line space-y-2">
                  <div className="flex justify-between">
                    <span className="text-mute">Дължима сума:</span>
                    <span className="font-tech font-bold text-ink">
                      {selectedPaymentForReview.amount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
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
                      {selectedPaymentForReview.proofExtractedData?.referenceNumber || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-mute shrink-0">Основание:</span>
                    <span className="text-ink text-right">
                      {selectedPaymentForReview.proofExtractedData?.paymentReason || selectedPaymentForReview.title}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-mute mb-1">Потвърдена получена сума (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={reviewPaidAmount}
                      onChange={(e) => setReviewPaidAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink font-tech font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-mute mb-1">Бележка / Причина при отхвърляне (по избор)</label>
                    <input
                      type="text"
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Напр.: Потвърдено по банков път / Невалиден IBAN"
                      className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink"
                    />
                  </div>
                </div>

                {selectedPaymentForReview.type === 'repair_fund' && (
                  <div className="text-[11px] text-stamp font-medium">
                    При потвърждаване сумата се прибавя автоматично към Фонд „Ремонт“ на сградата.
                  </div>
                )}
              </div>
            </div>

            {/* Decision Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => handleRejectPayment(selectedPaymentForReview)}
                className="px-3.5 py-2 text-xs font-medium text-red hover:bg-red-soft rounded-lg border border-red/30 transition-colors"
              >
                Отхвърли / Върни неплатено
              </button>
              {reviewPaidAmount > 0 && reviewPaidAmount < selectedPaymentForReview.amount && (
                <button
                  type="button"
                  onClick={() => handleConfirmPayment(selectedPaymentForReview, true)}
                  className="px-3.5 py-2 text-xs font-semibold text-mat bg-mat-soft hover:bg-raise rounded-lg border border-mat/40 transition-colors"
                >
                  Отбележи частично платено
                </button>
              )}
              <button
                type="button"
                onClick={() => handleConfirmPayment(selectedPaymentForReview, false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-stamp hover:opacity-90 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>Потвърди плащането</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tenant Upload Proof / Declare Payment Modal */}
      {isUploadModalOpen && paymentToUploadFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-ochre" />
                <h3 className="text-base font-bold text-ink">
                  Плащане за: {paymentToUploadFor.title}
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

            <div className="p-3 rounded-xl bg-raise/40 border border-line text-xs space-y-2">
              <div className="flex justify-between">
                <div>
                  <span className="text-mute block text-[11px]">Дължима сума:</span>
                  <span className="text-base font-bold font-tech text-ink">
                    {paymentToUploadFor.amount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-mute block text-[11px]">Краен срок:</span>
                  <span className="text-ink font-tech">{paymentToUploadFor.dueDate}</span>
                </div>
              </div>
              {building.iban && (
                <div className="pt-2 border-t border-line text-[11px] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Преведи по IBAN: <code className="font-tech font-bold text-stamp">{building.iban}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(building.iban!.replace(/\s/g, ''));
                      setCopiedIban(true);
                      setTimeout(() => setCopiedIban(false), 2000);
                    }}
                    className="text-mat font-semibold underline"
                  >
                    {copiedIban ? 'Копирано' : 'Копирай IBAN'}
                  </button>
                </div>
              )}
            </div>

            {/* Upload Drag & Drop Area */}
            <div className="border-2 border-dashed border-rule hover:border-ochre/50 rounded-xl p-5 text-center transition-colors">
              <input
                type="file"
                id="receipt-file"
                accept="image/*,application/pdf"
                onChange={handleReceiptFileChange}
                className="hidden"
              />
              {uploadError && <p role="alert" className="text-red text-xs mb-2">{uploadError}</p>}
              <label htmlFor="receipt-file" className="cursor-pointer block">
                <Upload className="w-7 h-7 text-ochre mx-auto mb-1.5" />
                <span className="text-xs font-semibold text-ink block">
                  Прикачи снимка или PDF на платежното нареждане (по избор)
                </span>
                <span className="text-[11px] text-mute mt-1 block">
                  PNG, JPG или PDF (до 400 KB) — или само въведи данните по-долу
                </span>
              </label>

              {uploadFile && (
                <div className="mt-2.5 p-2 bg-raise rounded-lg text-xs text-ochre font-tech truncate">
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
                  <span>AI извлече данните: {aiAnalysisResult.detectedAmount} €</span>
                </div>
                <div className="text-[11px] text-ink">{aiAnalysisResult.notes}</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-mute mb-1">Платена сума (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={uploadPaidAmount}
                  onChange={(e) => setUploadPaidAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink font-tech"
                />
              </div>
              <div>
                <label className="block text-mute mb-1">Референтен № / Превод (по избор)</label>
                <input
                  type="text"
                  value={uploadReference}
                  onChange={(e) => setUploadReference(e.target.value)}
                  placeholder="Напр.: REF12345"
                  className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink font-tech"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="block text-mute mb-1">Бележка към собственика (по избор)</label>
              <input
                type="text"
                value={uploadNote}
                onChange={(e) => setUploadNote(e.target.value)}
                placeholder="Напр.: Платено по банков път / на каса"
                className="w-full px-3 py-2 bg-film border border-rule rounded-lg text-ink"
              />
            </div>

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
                className="px-4 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors shadow-sm"
              >
                Изпрати за потвърждение
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner Create New Payment Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-bold text-ink">
                Ново задължение (наем, фонд или сметка)
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-mute hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {apartments.length > 0 && (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-film border border-line">
                  <button
                    type="button"
                    onClick={() => setCreateScope('single')}
                    className={`py-1.5 px-2 rounded-lg font-semibold ${
                      createScope === 'single' ? 'bg-mat text-white' : 'text-ink hover:bg-raise'
                    }`}
                  >
                    Конкретен апартамент
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateScope('all_apartments')}
                    className={`py-1.5 px-2 rounded-lg font-semibold ${
                      createScope === 'all_apartments' ? 'bg-mat text-white' : 'text-ink hover:bg-raise'
                    }`}
                  >
                    Всички апартаменти
                  </button>
                </div>
              )}

              {createScope === 'single' && (
                <div>
                  <label className="block text-mute mb-1">Апартамент</label>
                  {apartments.length > 0 ? (
                    <select
                      value={newApartmentNumber}
                      onChange={(e) => handleTypeOrAptChange(newType, e.target.value, newPeriod)}
                      className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                    >
                      {apartments.map((a) => (
                        <option key={a.id} value={a.number}>
                          Апартамент {a.number}{a.tenantName ? ` · ${a.tenantName}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newApartmentNumber}
                      onChange={(e) => setNewApartmentNumber(e.target.value)}
                      placeholder="Напр. 1 или Общи части"
                      className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                    />
                  )}
                </div>
              )}

              <div>
                <label className="block text-mute mb-1">Вид задължение</label>
                <select
                  value={newType}
                  onChange={(e) => handleTypeOrAptChange(e.target.value as PaymentType, newApartmentNumber, newPeriod)}
                  className="w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink"
                >
                  <option value="rent">Месечен Наем</option>
                  <option value="repair_fund">Фонд „Ремонт и Обновяване“</option>
                  <option value="common_fund">Такса Общи Части</option>
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
                  <label className="block text-mute mb-1">
                    {createScope === 'all_apartments' && (newType === 'rent' || newType === 'common_fund')
                      ? 'Сума (€) — 0 за сумата от ап.'
                      : 'Сума (€)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
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
                disabled={createScope === 'single' ? !newApartmentNumber.trim() || newAmount <= 0 : apartments.length === 0}
                onClick={handleCreateObligations}
                className="px-4 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {createScope === 'all_apartments' ? 'Създай за апартаментите' : 'Запази задължението'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
