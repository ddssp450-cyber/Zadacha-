import React, { useState } from 'react';
import { 
  Building2, 
  Lock, 
  Mail, 
  User, 
  Phone, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Home, 
  Wrench, 
  HardHat,
  Sparkles,
  KeyRound,
  X
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { api } from '../api';
import { isValidPhone } from '../validation';

interface AuthModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onLoginSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen = true,
  onClose,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Registration fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('owner');
  const [companyName, setCompanyName] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const submit = async (url: string, body: unknown) => {
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await api<{ user: UserProfile }>(url, 'POST', body);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Нещо се обърка. Опитай пак.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    submit('/api/auth/login', { email: email.trim().toLowerCase(), password });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Напиши име и фамилия.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Тоя имейл не изглежда наред.');
      return;
    }

    if (!isValidPhone(phone)) {
      setError('Телефонът трябва да е български номер, напр. +359 88 123 4567.');
      return;
    }

    if (password.length < 8) {
      setError('Паролата трябва да бъде поне 8 символа.');
      return;
    }

    let roleTitle = 'Собственик на имот';
    if (role === 'tenant') roleTitle = 'Наемател';
    else if (role === 'builder') roleTitle = `Строителен ръководител (${companyName || 'Строител'})`;
    else if (role === 'craftsman') roleTitle = `Техник / Майстор (${companyName || 'Сервиз'})`;

    const newUser = {
      name: fullName.trim(),
      email: trimmedEmail,
      phone: phone.trim(),
      role,
      roleTitle,
      companyName: companyName.trim() || undefined,
      avatarUrl: '',
    };

    submit('/api/auth/register', { ...newUser, password });
  };

  const quickFillSample = (sampleRole: UserRole) => {
    if (sampleRole === 'owner') {
      setEmail('d.ivanov@buildingbrain.bg');
      setPassword('admin123');
    } else if (sampleRole === 'tenant') {
      setEmail('elena.g@gmail.com');
      setPassword('tenant123');
    } else if (sampleRole === 'builder') {
      setEmail('stefan@elitstroy.bg');
      setPassword('builder123');
    } else if (sampleRole === 'craftsman') {
      setEmail('kamen.fix@termo-vik.bg');
      setPassword('master123');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center px-4 py-8 bg-ink/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md my-auto space-y-4 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-raise hover:bg-rule text-ink hover:text-ink border border-rule  transition-all"
            title="Затвори"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Brand Header: Sofia Enamel Plate Identity */}
        <div className="plate plate-deep p-5 text-center  space-y-1">
          <h1 className="font-tech text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            BUILDING BRAIN
          </h1>
          <p className="text-xs text-[#d3e0d7] font-medium tracking-wide">
            Една сграда. Един календар. Един интелигентен асистент.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl border border-line bg-sheet p-6  space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-film rounded-xl border border-line text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-colors text-center ${
                mode === 'login'
                  ? 'bg-mat-soft text-mat font-bold border border-mat/60 shadow-sm'
                  : 'text-ink hover:text-ink'
              }`}
            >
              Вход в профила
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-colors text-center ${
                mode === 'register'
                  ? 'bg-mat-soft text-mat font-bold border border-mat/60 shadow-sm'
                  : 'text-ink hover:text-ink'
              }`}
            >
              Нова регистрация
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-soft border border-red text-xs text-red flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form: LOGIN */}
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="block text-ink font-medium mb-1">
                  Имейл адрес
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-film border border-line rounded-xl text-ink placeholder-[#787163] focus:outline-none focus:border-mat"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink font-medium mb-1">
                  Парола
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-film border border-line rounded-xl text-ink placeholder-[#787163] focus:outline-none focus:border-mat"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-mat hover:bg-mat-deep text-white font-bold rounded-xl shadow-lg shadow-ink/10 border border-mat/40 transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>Влез в системата</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Sample Quick Login Helper */}
              <div className="pt-4 border-t border-line">
                <span className="text-[11px] font-semibold text-ink uppercase tracking-wider block mb-2">
                  Или изберете демо профил за 1 клик:
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => quickFillSample('owner')}
                    className="p-2 rounded-lg bg-film hover:bg-raise border border-line text-left transition-colors"
                  >
                    <span className="font-semibold text-ink block">Собственик</span>
                    <span className="text-mute truncate block">d.ivanov@buildingbrain.bg</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFillSample('tenant')}
                    className="p-2 rounded-lg bg-film hover:bg-mat-soft border border-mat/40 text-left transition-colors"
                  >
                    <span className="font-semibold text-mat block">Наемател (Ап. 5)</span>
                    <span className="text-mute truncate block">elena.g@gmail.com</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFillSample('builder')}
                    className="p-2 rounded-lg bg-film hover:bg-stamp-soft border border-stamp/40 text-left transition-colors"
                  >
                    <span className="font-semibold text-stamp block">Строител</span>
                    <span className="text-mute truncate block">stefan@elitstroy.bg</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quickFillSample('craftsman')}
                    className="p-2 rounded-lg bg-film hover:bg-raise border border-line text-left transition-colors"
                  >
                    <span className="font-semibold text-ink block">Майстор / Техник</span>
                    <span className="text-mute truncate block">kamen.fix@termo-vik.bg</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* Form: REGISTER */
            <form onSubmit={handleRegister} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-ink font-medium mb-1">
                  Име и фамилия
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Напр. Георги Иванов"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-film border border-line rounded-xl text-ink placeholder-[#787163] focus:outline-none focus:border-mat"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink font-medium mb-1">
                  Имейл адрес
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="vasheto.ime@example.bg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-film border border-line rounded-xl text-ink placeholder-[#787163] focus:outline-none focus:border-mat"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink font-medium mb-1">
                  Парола
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="Минимум 8 символа"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-film border border-line rounded-xl text-ink placeholder-[#787163] focus:outline-none focus:border-mat"
                  />
                </div>
              </div>

              {/* Role Picker */}
              <div>
                <label className="block text-ink font-medium mb-1.5">
                  Изберете вашата роля в сградата:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('owner')}
                    className={`p-2.5 rounded-xl border text-left transition-colors flex items-center gap-2 ${
                      role === 'owner'
                        ? 'bg-hi-soft border-line text-ink font-semibold'
                        : 'bg-film border-line text-mute hover:text-ink'
                    }`}
                  >
                    <Home className="w-4 h-4 text-ink shrink-0" />
                    <div>
                      <span className="block text-xs">Собственик</span>
                      <span className="text-[10px] text-ink block leading-tight">Управлява сградата</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('tenant')}
                    className={`p-2.5 rounded-xl border text-left transition-colors flex items-center gap-2 ${
                      role === 'tenant'
                        ? 'bg-mat-soft border-mat text-ink font-semibold'
                        : 'bg-film border-line text-mute hover:text-ink'
                    }`}
                  >
                    <User className="w-4 h-4 text-mat shrink-0" />
                    <div>
                      <span className="block text-xs">Наемател</span>
                      <span className="text-[10px] text-ink block leading-tight">Плаща наем, пуска сигнали</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('builder')}
                    className={`p-2.5 rounded-xl border text-left transition-colors flex items-center gap-2 ${
                      role === 'builder'
                        ? 'bg-stamp-soft border-stamp text-ink font-semibold'
                        : 'bg-film border-line text-mute hover:text-ink'
                    }`}
                  >
                    <HardHat className="w-4 h-4 text-stamp shrink-0" />
                    <div>
                      <span className="block text-xs">Строител</span>
                      <span className="text-[10px] text-ink block leading-tight">Гаранции и дефекти</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('craftsman')}
                    className={`p-2.5 rounded-xl border text-left transition-colors flex items-center gap-2 ${
                      role === 'craftsman'
                        ? 'bg-sheet border-mat text-ink font-semibold'
                        : 'bg-film border-line text-mute hover:text-ink'
                    }`}
                  >
                    <Wrench className="w-4 h-4 text-ink shrink-0" />
                    <div>
                      <span className="block text-xs">Майстор</span>
                      <span className="text-[10px] text-ink block leading-tight">Ремонти и огледи</span>
                    </div>
                  </button>
                </div>
              </div>

              {role === 'tenant' && (
                <p className="text-[11px] text-mute">
                  Апартаментът ти се задава от собственика, когато те добави в сградата.
                </p>
              )}

              {/* Conditional: Company name for Builder / Craftsman */}
              {(role === 'builder' || role === 'craftsman') && (
                <div>
                  <label className="block text-ink font-medium mb-1">
                    Име на строителна / сервизна фирма
                  </label>
                  <input
                    type="text"
                    placeholder="Напр. Елит Строй ООД или ВиК Експрес"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-2 bg-film border border-line rounded-xl text-ink"
                  />
                </div>
              )}

              <div>
                <label className="block text-ink font-medium mb-1">
                  Телефон за връзка
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="+359 88 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-film border border-line rounded-xl text-ink font-tech"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-hi hover:bg-hi text-ink font-bold rounded-xl shadow-lg shadow-ink/10 transition-all text-xs flex items-center justify-center gap-2 mt-4 disabled:opacity-60"
              >
                <span>Създай акаунт и влез</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-sheet">
          BUILDING BRAIN · Защитено управление на сгради и имоти в България
        </p>
      </div>
    </div>
  );
};
