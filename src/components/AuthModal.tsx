import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { loginAndClaimAsTenant, loginWithEmail, registerWithEmail } from '../lib/apiClient';

interface AuthModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onLoginSuccess?: () => void;
}

type AuthTab = 'login' | 'register' | 'tenant';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen = true,
  onClose,
  onLoginSuccess,
}) => {
  const [tab, setTab] = useState<AuthTab>('login');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');

  // Tenant lookup field
  const [tenantIdentifier, setTenantIdentifier] = useState('');

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setError(null);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginEmail.trim() || !loginPassword) {
      setError('Въведи имейл и парола.');
      return;
    }
    setSubmitting(true);
    try {
      await loginWithEmail(loginEmail.trim(), loginPassword);
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Неуспешен вход. Опитай пак.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!regName.trim()) {
      setError('Въведи име и фамилия.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError('Въведи валиден имейл адрес.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Паролата трябва да е поне 6 символа.');
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setError('Двете пароли не съвпадат.');
      return;
    }

    setSubmitting(true);
    try {
      await registerWithEmail({
        name: regName.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim() || undefined,
        password: regPassword,
      });
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Неуспешна регистрация. Опитай пак.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTenantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!tenantIdentifier.trim()) {
      setError('Въведи имейл, телефонен номер или името, под което те е записал собственикът.');
      return;
    }
    setSubmitting(true);
    try {
      await loginAndClaimAsTenant(tenantIdentifier.trim());
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Не успяхме да влезем като наемател.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full pl-9 pr-3 py-2.5 bg-raise border border-rule rounded-xl text-ink placeholder:text-mute focus:outline-none focus:border-mat text-xs';

  return (
    <div className="fixed inset-0 z-50 flex justify-center px-4 py-8 bg-ink/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md my-auto space-y-4 relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-raise hover:bg-rule text-ink border border-rule transition-all"
            title="Затвори"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Brand Header: Sofia Enamel Plate Identity */}
        <div className="plate plate-deep p-5 text-center space-y-1">
          <h1 className="font-tech text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            BUILDING BRAIN
          </h1>
          <p className="text-xs text-[#d3e0d7] font-medium tracking-wide">
            Една сграда. Един календар. Един интелигентен асистент.
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl border border-line bg-sheet p-5 sm:p-6 space-y-4 text-xs">
          {/* Mode Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-film border border-line">
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`py-2 px-2 rounded-lg font-semibold transition-colors text-[11px] ${
                tab === 'login' ? 'bg-mat text-white shadow-sm' : 'text-ink hover:bg-raise'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => switchTab('register')}
              className={`py-2 px-2 rounded-lg font-semibold transition-colors text-[11px] ${
                tab === 'register' ? 'bg-mat text-white shadow-sm' : 'text-ink hover:bg-raise'
              }`}
            >
              Регистрация
            </button>
            <button
              type="button"
              onClick={() => switchTab('tenant')}
              className={`py-2 px-2 rounded-lg font-semibold transition-colors text-[11px] ${
                tab === 'tenant' ? 'bg-mat text-white shadow-sm' : 'text-ink hover:bg-raise'
              }`}
            >
              Влез като наемател
            </button>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-soft border border-red text-xs text-red flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <div className="relative">
                <Mail className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Имейл адрес"
                  className={inputClass}
                />
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Парола"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-mat hover:bg-mat-deep text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>{submitting ? 'Влизане…' : 'Влез в профила'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {tab === 'register' && (
            <div className="space-y-3">
              <p className="text-[11px] text-mute leading-relaxed">
                Създай профил на собственик / управител, за да регистрираш сгради и да добавяш наематели, строители и майстори.
              </p>

              <form onSubmit={handleRegister} className="space-y-2.5">
                <div className="relative">
                  <User className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Име и фамилия"
                    className={inputClass}
                  />
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="Имейл адрес"
                    className={inputClass}
                  />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Телефон (по избор)"
                    className={inputClass}
                  />
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Парола (минимум 6 символа)"
                    className={inputClass}
                  />
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPasswordConfirm}
                    onChange={(e) => setRegPasswordConfirm(e.target.value)}
                    placeholder="Потвърди паролата"
                    className={inputClass}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-mat hover:bg-mat-deep text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span>{submitting ? 'Създаване на профил…' : 'Регистрирай се'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {tab === 'tenant' && (
            <form onSubmit={handleTenantLogin} className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-mat" />
                  <span>Вход за наемател / майстор / строител</span>
                </h2>
                <p className="text-[11px] text-mute leading-relaxed">
                  Въведи <b>телефонния номер</b>, <b>името</b> или <b>имейла</b>, по който собственикът те е записал в сградата. Ако си добавен в няколко сгради от различни собственици, ще видиш всички наведнъж.
                </p>
              </div>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-mute absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={tenantIdentifier}
                  onChange={(e) => setTenantIdentifier(e.target.value)}
                  placeholder="Напр.: 0888123456, Иван Петров или ivan@..."
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-mat hover:bg-mat-deep text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>{submitting ? 'Търсене на сграда…' : 'Влез като наемател'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="p-3 rounded-xl bg-film border border-line flex items-start gap-2 text-[11px] text-mute">
            <ShieldCheck className="w-4 h-4 text-mat shrink-0 mt-0.5" />
            <span>
              Всеки потребител вижда само сградите, апартаментите и плащанията, за които е добавен (Собственик, Наемател, Строител или Майстор).
            </span>
          </div>
        </div>

        <p className="text-center text-[11px] text-sheet">
          BUILDING BRAIN · Управление на сгради и имоти
        </p>
      </div>
    </div>
  );
};
