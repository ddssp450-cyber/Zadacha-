import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Sparkles, 
  X, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  Wrench, 
  DollarSign, 
  ArrowRight, 
  Video, 
  RotateCcw,
  ShieldCheck,
  Check
} from 'lucide-react';
import { UserProfile, RepairTicket } from '../types';

interface CameraDiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onCreateTicketFromDiagnosis: (ticket: Omit<RepairTicket, 'id' | 'ticketNumber'>) => void;
}

export const CameraDiagnosisModal: React.FC<CameraDiagnosisModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onCreateTicketFromDiagnosis,
}) => {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState('');
  const [apartmentNumber, setApartmentNumber] = useState(currentUser.apartmentNumber ?? '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<any | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopWebcam();
      setPhotoPreview(null);
      setDiagnosis(null);
      setUserNotes('');
    }
  }, [isOpen]);

  const startWebcam = async () => {
    try {
      setWebcamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsWebcamActive(true);
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setWebcamError('Не може да се отвори камерата на устройството. Моля, използвайте бутона за качване на снимка.');
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsWebcamActive(false);
  };

  const captureWebcamSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoPreview(dataUrl);
      stopWebcam();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoPreview(event.target.result as string);
          setDiagnosis(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const runAiDiagnosis = async () => {
    if (!photoPreview) return;
    setIsAnalyzing(true);
    setDiagnosis(null);
    setDiagnoseError(null);

    try {
      const res = await fetch('/api/ai/diagnose-damage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photoPreview,
          mimeType: 'image/jpeg',
          userNotes,
          apartmentNumber,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setDiagnosis(data.diagnosis);
      else setDiagnoseError(data.error || 'AI не успя да разгледа снимката. Пробвай пак.');
    } catch (err) {
      console.error('Diagnosis request error:', err);
      setDiagnoseError('Няма връзка със сървъра. Пробвай пак.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateTicket = () => {
    if (!diagnosis || !photoPreview) return;

    onCreateTicketFromDiagnosis({
      title: diagnosis.detectedIssue,
      description: `${diagnosis.recommendedAction}\n\nКонстатация от AI: ${diagnosis.severityReason}`,
      category: diagnosis.category || 'plumbing',
      priority: diagnosis.severity || 'high',
      status: 'reported',
      buildingId: currentUser.buildingId,
      apartmentNumber: apartmentNumber,
      reporterRole: currentUser.role,
      reporterName: currentUser.name,
      estimatedBudget: diagnosis.estimatedBudget || 140,
      reportedDate: new Date().toISOString().split('T')[0],
      deadlineDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      locationDetail: `Ап. ${apartmentNumber} (${diagnosis.categoryBg})`,
      beforePhotos: [photoPreview],
      afterPhotos: [],
      materialsUsed: diagnosis.requiredMaterials || [],
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/45">
      <div className="relative w-full max-w-2xl max-h-[92vh] rounded-2xl bg-sheet border border-line  flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-line bg-raise flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="plate w-8 h-8 flex items-center justify-center text-ink">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <span>Снимай повредата</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-hi/10 text-ochre border border-ochre/20 font-tech">
                  Claude Vision
                </span>
              </h3>
              <p className="text-[11px] text-mute">
                Снимайте повреда с камерата на телефона — AI разпознава дефекта, необходимия майстор и бюджет
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-mute hover:text-ink hover:bg-raise transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Camera Viewfinder or Upload State */}
          <div className="rounded-xl border border-line bg-film overflow-hidden">
            {isWebcamActive ? (
              <div className="relative aspect-video bg-film flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                  <button
                    onClick={captureWebcamSnapshot}
                    className="px-5 py-2.5 bg-hi hover:bg-hi text-ink font-bold rounded-full  flex items-center gap-2 text-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Снимай сега</span>
                  </button>
                  <button
                    onClick={stopWebcam}
                    className="px-4 py-2 bg-raise text-ink rounded-full text-xs"
                  >
                    Отказ
                  </button>
                </div>
              </div>
            ) : photoPreview ? (
              <div className="relative aspect-video max-h-64 bg-film flex items-center justify-center">
                <img
                  src={photoPreview}
                  alt="Заснета повреда"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={() => {
                      setPhotoPreview(null);
                      setDiagnosis(null);
                    }}
                    className="px-3 py-1.5 bg-sheet/90 text-ink rounded-lg text-xs flex items-center gap-1.5  border border-rule"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Нова снимка</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {/* Native Phone Camera Input - Sofia Blue Details */}
                  <label className="cursor-pointer flex items-center gap-2 px-5 py-3 rounded-xl bg-mat hover:bg-mat-deep text-white font-bold shadow-lg transition-transform hover:scale-[1.02] border border-mat/40">
                    <Camera className="w-4 h-4 text-ink" />
                    <span>Снимай с камерата на телефона</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>

                  {/* Browser Live Webcam */}
                  <button
                    onClick={startWebcam}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-sheet hover:bg-sheet text-ink font-semibold border border-line transition-colors"
                  >
                    <Video className="w-4 h-4 text-stamp" />
                    <span>Отвори уебкамера на живо</span>
                  </button>

                  {/* Gallery upload */}
                  <label className="cursor-pointer flex items-center gap-2 px-4 py-3 rounded-xl bg-sheet hover:bg-sheet text-ink font-medium border border-line transition-colors">
                    <Upload className="w-4 h-4 text-mute" />
                    <span>Избери от галерия</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <p className="text-[11px] text-ink">
                  Поддържа директно снимане на течове, пукнатини, изгорели бушони, проблеми с климатици или асансьори.
                </p>

                {webcamError && (
                  <p className="text-red text-xs bg-red/30 p-2 rounded-lg border border-red/30">
                    {webcamError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Location & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-ink text-[11px] mb-1 font-medium">
                Апартамент / Зона:
              </label>
              <input
                type="text"
                value={apartmentNumber}
                onChange={(e) => setApartmentNumber(e.target.value)}
                placeholder="Напр. Ап. 5 или Вход А"
                className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:border-mat focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-ink text-[11px] mb-1 font-medium">
                Какво забелязвате (по избор):
              </label>
              <input
                type="text"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Напр. капе вода под мивката, шуми силно или мирише на изгоряло"
                className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink focus:border-mat focus:outline-none"
              />
            </div>
          </div>

          {/* Action to trigger AI diagnosis */}
          {photoPreview && !diagnosis && (
            <div className="pt-2">
              <button
                onClick={runAiDiagnosis}
                disabled={isAnalyzing}
                className="w-full py-3 rounded-xl bg-stamp-soft hover:bg-stamp-soft disabled:opacity-50 text-ink font-bold text-xs flex items-center justify-center gap-2 border border-stamp/50 shadow-lg transition-all"
              >
                <Sparkles className={`w-4 h-4 text-stamp ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isAnalyzing ? 'AI сканира и диагностицира дефекта...' : 'Стартирай AI Диагностика на повредата'}</span>
              </button>
              {diagnoseError && <p role="alert" className="mt-2 text-xs text-red">{diagnoseError}</p>}
            </div>
          )}

          {/* Diagnosis Results Card */}
          {diagnosis && (
            <div className="rounded-2xl border border-mat/40 bg-mat-soft p-4 space-y-3.5 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-stamp" />
                  <span className="font-bold text-ink text-sm">
                    {diagnosis.detectedIssue}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-tech text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-sheet text-ink border border-line">
                    {diagnosis.categoryBg}
                  </span>
                  <span className={`px-2 py-0.5 rounded border ${
                    diagnosis.severity === 'urgent'
                      ? 'bg-red/20 text-red border-red/30 font-bold'
                      : 'bg-hi-soft text-ink border-ochre'
                  }`}>
                    {diagnosis.severityBg} приоритет
                  </span>
                </div>
              </div>

              {/* Diagnosis details strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-film rounded-xl border border-line space-y-1">
                  <span className="text-[11px] text-mute block font-semibold">
                    Оценка на риска & спешност:
                  </span>
                  <p className="text-ink leading-snug">
                    {diagnosis.severityReason}
                  </p>
                </div>

                <div className="p-3 bg-film rounded-xl border border-line space-y-1">
                  <span className="text-[11px] text-mute block font-semibold">
                    Препоръчан специалист & Бюджет:
                  </span>
                  <div className="text-stamp font-medium">
                    {diagnosis.tradeNeeded}
                  </div>
                  <div className="text-[11px] text-ink">
                    Ориентировъчна стойност: <strong className="text-ink font-tech text-xs">{diagnosis.estimatedBudget} €</strong> (труд и материали)
                  </div>
                </div>
              </div>

              {/* Action Plan & Materials */}
              <div className="p-3 bg-film rounded-xl border border-line space-y-2 text-xs">
                <div>
                  <span className="text-[11px] text-mute font-semibold block mb-0.5">
                    Технически стъпки за отстраняване:
                  </span>
                  <p className="text-ink leading-relaxed">
                    {diagnosis.recommendedAction}
                  </p>
                </div>

                {diagnosis.requiredMaterials && diagnosis.requiredMaterials.length > 0 && (
                  <div className="pt-2 border-t border-line">
                    <span className="text-[11px] text-mute font-semibold block mb-1">
                      Необходими материали и компоненти:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {diagnosis.requiredMaterials.map((mat: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-sheet text-ink text-[11px] border border-line font-tech"
                        >
                          {mat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 1-Click CTA */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-line">
                <span className="text-[11px] text-ink">
                  Заявката ще се впише с уникален номер и снимка в регистъра на сградата.
                </span>

                <button
                  onClick={handleCreateTicket}
                  className="w-full sm:w-auto px-5 py-2.5 bg-mat hover:bg-mat-deep text-white font-bold rounded-xl border border-mat/40 transition-all shadow-md flex items-center justify-center gap-2 text-xs"
                >
                  <Wrench className="w-4 h-4 text-stamp" />
                  <span>Създай ремонтна заявка от този анализ</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
