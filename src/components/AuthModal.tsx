import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { claimInvitesByIdentifier, ensureUserDoc, loginAndClaimAsTenant } from '../lib/firestoreStore';

interface AuthModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onLoginSuccess?: () => void;
}

type AuthTab = 'login' | 'register' | 'tenant';

const FIREBASE_PROVIDERS_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0157524388/authentication/providers';

function mapAuthError(err: any, fallback: string, providerLabel?: string): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Прозорецът за вход беше затворен преди завършване.';
    case 'auth/popup-blocked':
      return 'Браузърът блокира изскачащия прозорец. Разреши pop-up прозорците и опитай пак.';
    case 'auth/network-request-failed':
      return 'Няма връзка с интернет. Провери мрежата и опитай пак.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Грешен имейл или парола.';
    case 'auth/email-already-in-use':
      return 'Вече има регистриран профил с този имейл. Използвай „Вход“ или възстановяване на парола.';
    case 'auth/weak-password':
      return 'Паролата трябва да е поне 6 символа.';
    case 'auth/invalid-email':
      return 'Въведи валиден имейл адрес.';
    case 'auth/too-many-requests':
      return 'Твърде много опити. Изчакай малко и опитай отново.';
    case 'auth/operation-not-allowed':
      return `Методът ${providerLabel || 'за вход'} не е включен във Firebase Console (Authentication -> Sign-in method) за проект gen-lang-client-0157524388. Активирай го от конзолата или влез с Google веднага.`;
    default:
      return err instanceof Error ? err.message : fallback;
  }
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen = true,
  onClose,
  onLoginSuccess,
}) => {
  const [tab, setTab] = useState<AuthTab>('login');
  const [error, setError] = useState<string | null>(null);
  const [blockedProvider, setBlockedProvider] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
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
    setBlockedProvider(null);
    setInfoMsg(null);
  };

  const handleError = (err: any, fallback: string, providerLabel?: string) => {
    if (err?.code === 'auth/operation-not-allowed') {
      setBlockedProvider(providerLabel || 'Email/Password');
    } else {
      setBlockedProvider(null);
    }
    setError(mapAuthError(err, fallback, providerLabel));
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setBlockedProvider(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      handleError(err, 'Неуспешен вход с Google. Опитай пак.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleTenantSignIn = async () => {
    setError(null);
    setBlockedProvider(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      await ensureUserDoc(cred.user);
      if (tenantIdentifier.trim()) {
        await claimInvitesByIdentifier(cred.user, tenantIdentifier.trim());
      }
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      handleError(err, 'Неуспешен вход с Google. Опитай пак.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBlockedProvider(null);
    setInfoMsg(null);
    if (!loginEmail.trim() || !loginPassword) {
      setError('Въведи имейл и парола.');
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      handleError(err, 'Неуспешен вход. Опитай пак.', 'Email/Password');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setBlockedProvider(null);
    setInfoMsg(null);
    if (!loginEmail.trim() || !loginEmail.includes('@')) {
      setError('Първо въведи своя имейл в полето по-горе, за да ти изпратим линк за смяна на паролата.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setInfoMsg('Изпратихме линк за смяна на паролата на твоя имейл.');
    } catch (err: any) {
      handleError(err, 'Не успяхме да изпратим имейл за смяна на парола.', 'Email/Password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBlockedProvider(null);
    setInfoMsg(null);

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
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      await updateProfile(cred.user, { displayName: regName.trim() });
      if (regPhone.trim()) {
        try {
          sessionStorage.setItem('bb_pending_phone', regPhone.trim());
        } catch {
          // Ignore storage restrictions
        }
      }
      await sendEmailVerification(cred.user);
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      handleError(err, 'Неуспешна регистрация. Опитай пак.', 'Email/Password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTenantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBlockedProvider(null);
    setInfoMsg(null);
    if (!tenantIdentifier.trim()) {
      setError('Въведи имейл, телефонен номер или името, под което те е записал собственикът.');
      return;
    }
    setSubmitting(true);
    try {
      await loginAndClaimAsTenant(tenantIdentifier);
      onLoginSuccess?.();
      onClose?.();
    } catch (err: any) {
      handleError(err, 'Не успяхме да влезем като наемател.', 'Anonymous');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full pl-9 pr-3 py-2.5 bg-raise border border-rule rounded-xl text-ink placeholder:text-mute focus:outline-none focus:border-mat text-xs';

  const GoogleIcon = () => (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.24-.94 2.29-2 2.99v2.48h3.23c1.89-1.74 2.97-4.3 2.97-7.34 0-.7-.06-1.38-.3-1.05z"
      />
      <path
        fill="currentColor"
        d="M12.18 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.48c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.24v2.56C4.89 19.77 8.27 22 12.18 22z"
      />
      <path
        fill="currentColor"
        d="M6.57 13.92c-.2-.6-.31-1.24-.31-1.92s.11-1.32.31-1.92V7.52H3.24A9.81 9.81 0 0 0 2.18 12c0 1.59.38 3.1 1.06 4.48l3.33-2.56z"
      />
      <path
        fill="currentColor"
        d="M12.18 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.87C17.13 2.96 14.87 2 12.18 2 8.27 2 4.89 4.23 3.24 7.52l3.33 2.56c.79-2.37 3-4.13 5.61-4.13z"
      />
    </svg>
  );

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
            <div role="alert" className="p-3 rounded-xl bg-red-soft border border-red text-xs text-red space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {blockedProvider && (
                <div className="p-2.5 rounded-lg bg-sheet border border-line text-ink space-y-2 text-[11px]">
                  <div className="font-semibold">
                    Как да активираш {blockedProvider} във Firebase (отнема 30 сек.):
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-mute">
                    <li>Отвори Firebase Console &rarr; Authentication &rarr; Sign-in method</li>
                    <li>Кликни <b>Add new provider</b> и включи <b>Email/Password</b> и <b>Anonymous</b></li>
                    <li>Натисни <b>Save</b> и опитай отново тук</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={FIREBASE_PROVIDERS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-mat hover:bg-mat-deep text-white font-semibold text-[11px]"
                    >
                      <span>Отвори Firebase Console</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(FIREBASE_PROVIDERS_URL);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-raise hover:bg-rule text-ink border border-rule text-[11px]"
                    >
                      {copiedUrl ? <Check className="w-3 h-3 text-stamp" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedUrl ? 'Линкът е копиран' : 'Копирай линка'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={tab === 'tenant' ? handleGoogleTenantSignIn : handleGoogleSignIn}
                      disabled={submitting}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stamp text-white font-semibold text-[11px]"
                    >
                      <span>Влез с Google веднага</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {infoMsg && (
            <div className="p-3 rounded-xl bg-stamp-soft border border-stamp text-xs text-stamp flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-stamp shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {tab === 'login' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className="w-full py-3 px-4 bg-mat hover:bg-mat-deep text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2.5 disabled:opacity-60 shadow-sm"
              >
                <GoogleIcon />
                <span>Продължи с Google (работи веднага)</span>
              </button>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-line" />
                <span className="shrink mx-3 text-[11px] text-mute">или с имейл и парола</span>
                <div className="flex-grow border-t border-line" />
              </div>

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
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={submitting}
                    className="text-[11px] text-mat hover:text-ink font-medium"
                  >
                    Забравена парола?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-raise hover:bg-rule text-ink font-bold rounded-xl border border-rule transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span>{submitting ? 'Влизане…' : 'Влез с имейл и парола'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {tab === 'register' && (
            <div className="space-y-3">
              <p className="text-[11px] text-mute leading-relaxed">
                Създай профил на собственик / управител, за да регистрираш сгради и да добавяш наематели, строители и майстори.
              </p>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-raise hover:bg-rule text-ink font-bold rounded-xl border border-rule transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <GoogleIcon />
                <span>Бърза регистрация с Google</span>
              </button>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-line" />
                <span className="shrink mx-3 text-[11px] text-mute">или с имейл и парола</span>
                <div className="flex-grow border-t border-line" />
              </div>

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
                  <span>{submitting ? 'Създаване на профил…' : 'Регистрирай се с имейл'}</span>
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
                <span>{submitting ? 'Търсене на сграда…' : 'Влез без Google (телефон / име)'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleGoogleTenantSignIn}
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-raise hover:bg-rule text-ink font-semibold rounded-xl border border-rule transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <GoogleIcon />
                <span>Или влез с Google и намери имота</span>
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

        {/* Footer info */}
        <p className="text-center text-[11px] text-sheet">
          BUILDING BRAIN · Управление на сгради и имоти
        </p>
      </div>
    </div>
  );
};

