import React, { useState } from 'react';
import { X, Trash2, UserPlus, Building2 } from 'lucide-react';
import { Apartment, Building, UserRole } from '../types';
import { DeleteButton } from './PhotoPicker';

export interface Member {
  email: string;
  role: UserRole;
  apartmentNumber?: string | null;
  name?: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Собственик',
  tenant: 'Наемател',
  builder: 'Строител',
  craftsman: 'Майстор / Техник',
};

const input = 'w-full px-3 py-2 bg-raise border border-rule rounded-lg text-ink';
const primaryBtn = 'px-4 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep disabled:opacity-40 rounded-lg transition-colors';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-mute mb-1">{label}</span>
    {children}
  </label>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
    <div role="dialog" aria-label={title} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-sheet border border-line p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <button onClick={onClose} aria-label="Затвори" className="text-mute hover:text-ink">
          <X className="w-5 h-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// Runs an async save, keeps the form open and shows the server's message when it fails.
function useSave() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешно записване.');
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export type BuildingFields = Pick<Building, 'name' | 'address' | 'city' | 'postalCode' | 'totalFloors' | 'totalApartments' | 'yearBuilt' | 'contactManager' | 'phoneManager' | 'iban' | 'bankName'>;

export const BuildingFormModal: React.FC<{
  initial?: Building;
  onSave: (fields: BuildingFields) => Promise<unknown>;
  onClose: () => void;
  onDelete?: () => Promise<unknown>;
}> = ({ initial, onSave, onClose, onDelete }) => {
  const [f, setF] = useState<BuildingFields>({
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? 'София',
    postalCode: initial?.postalCode ?? '',
    totalFloors: initial?.totalFloors ?? 5,
    totalApartments: initial?.totalApartments ?? 10,
    yearBuilt: initial?.yearBuilt ?? new Date().getFullYear(),
    contactManager: initial?.contactManager ?? '',
    phoneManager: initial?.phoneManager ?? '',
    iban: initial?.iban ?? '',
    bankName: initial?.bankName ?? '',
  });
  const { error, busy, run } = useSave();
  const set = (k: keyof BuildingFields, num = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });

  return (
    <Modal title={initial ? 'Промяна на сградата' : 'Нова сграда'} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <Field label="Име на сградата"><input className={input} value={f.name} onChange={set('name')} placeholder="Напр.: Резиденция Лозенец" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Град"><input className={input} value={f.city} onChange={set('city')} /></Field>
          <Field label="Пощенски код"><input className={input} value={f.postalCode} onChange={set('postalCode')} /></Field>
        </div>
        <Field label="Адрес"><input className={input} value={f.address} onChange={set('address')} placeholder="ул. Примерна 12" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Етажи"><input type="number" min={1} className={input} value={f.totalFloors} onChange={set('totalFloors', true)} /></Field>
          <Field label="Апартаменти"><input type="number" min={0} className={input} value={f.totalApartments} onChange={set('totalApartments', true)} /></Field>
          <Field label="Година"><input type="number" className={input} value={f.yearBuilt} onChange={set('yearBuilt', true)} /></Field>
        </div>
        {initial && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Домоуправител"><input className={input} value={f.contactManager} onChange={set('contactManager')} /></Field>
            <Field label="Телефон"><input className={input} value={f.phoneManager} onChange={set('phoneManager')} /></Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="IBAN за плащания"><input className={`${input} font-tech`} value={f.iban} onChange={set('iban')} placeholder="BG.." /></Field>
          <Field label="Банка"><input className={input} value={f.bankName} onChange={set('bankName')} /></Field>
        </div>
        {error && <p role="alert" className="text-red">{error}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-line">
        {initial && onDelete && (
          <DeleteButton className="mr-auto" label="Изтрий сградата" onDelete={() => run(onDelete, onClose)} />
        )}
        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-mute hover:text-ink">Отказ</button>
        <button
          disabled={busy || !f.name.trim() || !f.address.trim() || !f.city.trim()}
          onClick={() => run(() => onSave(f), onClose)}
          className={primaryBtn}
        >
          {initial ? 'Запази' : 'Създай сградата'}
        </button>
      </div>
    </Modal>
  );
};

export const ApartmentFormModal: React.FC<{
  initial?: Apartment;
  buildingId: string;
  onSave: (apt: Apartment) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
}> = ({ initial, buildingId, onSave, onClose, onDelete }) => {
  const [a, setA] = useState<Apartment>(
    initial ?? {
      id: `apt-${Date.now()}`,
      buildingId,
      number: '',
      floor: 1,
      entrance: 'А',
      areaSqM: 60,
      rooms: 2,
      status: 'vacant',
      monthlyRent: 0,
      monthlyMaintenanceFee: 0,
      waterMeterReading: 0,
      electricMeterReading: 0,
      lastMeterUpdate: new Date().toISOString().split('T')[0],
    }
  );
  const set = (k: keyof Apartment, num = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setA({ ...a, [k]: num ? Number(e.target.value) : e.target.value });

  return (
    <Modal title={initial ? `Апартамент ${initial.number}` : 'Нов апартамент'} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Номер"><input className={input} value={a.number} onChange={set('number')} /></Field>
          <Field label="Етаж"><input type="number" className={input} value={a.floor} onChange={set('floor', true)} /></Field>
          <Field label="Вход"><input className={input} value={a.entrance ?? ''} onChange={set('entrance')} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Кв. м"><input type="number" className={input} value={a.areaSqM} onChange={set('areaSqM', true)} /></Field>
          <Field label="Стаи"><input type="number" className={input} value={a.rooms} onChange={set('rooms', true)} /></Field>
          <Field label="Статус">
            <select className={input} value={a.status} onChange={set('status')}>
              <option value="vacant">Свободен</option>
              <option value="occupied">Зает</option>
              <option value="under_repair">В ремонт</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Наемател"><input className={input} value={a.tenantName ?? ''} onChange={set('tenantName')} /></Field>
          <Field label="Телефон на наемателя"><input className={input} value={a.tenantPhone ?? ''} onChange={set('tenantPhone')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Наем €/мес."><input type="number" className={input} value={a.monthlyRent} onChange={set('monthlyRent', true)} /></Field>
          <Field label="Такса поддръжка €/мес."><input type="number" className={input} value={a.monthlyMaintenanceFee} onChange={set('monthlyMaintenanceFee', true)} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-line">
        {initial && onDelete && (
          <DeleteButton className="mr-auto" onDelete={() => { onDelete(initial.id); onClose(); }} />
        )}
        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-mute hover:text-ink">Отказ</button>
        <button disabled={!a.number.trim()} onClick={() => { onSave(a); onClose(); }} className={primaryBtn}>
          Запази
        </button>
      </div>
    </Modal>
  );
};

export const MembersPanel: React.FC<{
  members: Member[];
  onAdd: (m: { email: string; role: UserRole; apartmentNumber?: string }) => Promise<unknown>;
  onRemove: (email: string) => Promise<unknown>;
}> = ({ members, onAdd, onRemove }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('tenant');
  const [apt, setApt] = useState('');
  const { error, busy, run } = useSave();

  return (
    <div className="rounded-2xl border border-line bg-sheet p-5 space-y-4 text-xs">
      <div>
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-mat" /> Хора с достъп до сградата
        </h3>
        <p className="text-mute mt-1">
          Добави човек по имейл. Ако още няма профил, ще получи достъп щом се регистрира с този имейл.
        </p>
      </div>

      <form
        className="grid grid-cols-1 sm:grid-cols-[1fr_160px_100px_auto] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onAdd({ email, role, apartmentNumber: role === 'tenant' ? apt : undefined }), () => { setEmail(''); setApt(''); });
        }}
      >
        <Field label="Имейл"><input type="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Роля">
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {(['tenant', 'builder', 'craftsman'] as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        <Field label="Ап.">
          <input className={input} value={apt} disabled={role !== 'tenant'} required={role === 'tenant'} onChange={(e) => setApt(e.target.value)} />
        </Field>
        <button type="submit" disabled={busy} className={primaryBtn}>Добави</button>
      </form>
      {error && <p role="alert" className="text-red">{error}</p>}

      <ul className="divide-y divide-line">
        {members.map((m) => (
          <li key={m.email} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ink font-medium truncate">{m.name || 'Още не е регистриран'}</div>
              <div className="text-mute truncate">{m.email}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-ink">
                {ROLE_LABELS[m.role]}{m.apartmentNumber ? ` · Ап. ${m.apartmentNumber}` : ''}
              </span>
              {m.role !== 'owner' && (
                <button onClick={() => run(() => onRemove(m.email))} aria-label={`Премахни ${m.email}`} className="text-mute hover:text-red">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Full-page state before the user belongs to any building.
export const AccessGate: React.FC<{
  email: string;
  onCreateBuilding?: (fields: BuildingFields) => Promise<unknown>;
  onRecheck: () => void;
  onLogout: () => void;
}> = ({ email, onCreateBuilding, onRecheck, onLogout }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);

  return (
    <div className="max-w-md w-full mx-4 rounded-2xl border border-line bg-sheet p-6 space-y-4 text-xs">
      <h2 className="text-base font-bold text-ink flex items-center gap-2"><Building2 className="w-5 h-5 text-mat" /> Още нямаш сграда</h2>
      <p className="text-ink leading-relaxed">
        {onCreateBuilding ? 'Създай своя сграда или помоли собственик' : 'Помоли собственика на сградата'} да те добави с имейла <b>{email}</b>.
      </p>
      <div className="flex flex-wrap gap-3">
        {onCreateBuilding && <button onClick={() => setIsFormOpen(true)} className={primaryBtn}>Създай сграда</button>}
        <button onClick={onRecheck} className="px-4 py-2 text-xs font-medium text-mat hover:text-ink">Добавиха ме — провери пак</button>
      </div>
      <button onClick={onLogout} className="text-mute hover:text-ink">Изход</button>
      {isFormOpen && onCreateBuilding && <BuildingFormModal onSave={onCreateBuilding} onClose={() => setIsFormOpen(false)} />}
    </div>
  );
};
