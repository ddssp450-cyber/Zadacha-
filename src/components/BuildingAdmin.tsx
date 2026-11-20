import React, { useState } from 'react';
import { X, Trash2, UserPlus, Building2, Search } from 'lucide-react';
import { Apartment, Building, UserRole } from '../types';
import { DeleteButton } from './PhotoPicker';

export interface Member {
  email: string;
  phone?: string | null;
  role: UserRole;
  apartmentNumber?: string | null;
  name?: string | null;
  uid?: string;
  uids?: string[];
  inviteId?: string;
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

export type BuildingFields = Pick<
  Building,
  'name' | 'address' | 'city' | 'postalCode' | 'totalFloors' | 'totalApartments' | 'yearBuilt' | 'contactManager' | 'phoneManager' | 'iban' | 'bankName'
>;

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
        <Field label="Име на сградата">
          <input className={input} value={f.name} onChange={set('name')} placeholder="Напр.: Резиденция Лозенец" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Град">
            <input className={input} value={f.city} onChange={set('city')} />
          </Field>
          <Field label="Пощенски код">
            <input className={input} value={f.postalCode} onChange={set('postalCode')} />
          </Field>
        </div>
        <Field label="Адрес">
          <input className={input} value={f.address} onChange={set('address')} placeholder="ул. Примерна 12" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Етажи">
            <input type="number" min={1} className={input} value={f.totalFloors} onChange={set('totalFloors', true)} />
          </Field>
          <Field label="Апартаменти">
            <input type="number" min={0} className={input} value={f.totalApartments} onChange={set('totalApartments', true)} />
          </Field>
          <Field label="Година">
            <input type="number" className={input} value={f.yearBuilt} onChange={set('yearBuilt', true)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Домоуправител">
            <input className={input} value={f.contactManager} onChange={set('contactManager')} placeholder="Име за контакт" />
          </Field>
          <Field label="Телефон">
            <input className={input} value={f.phoneManager} onChange={set('phoneManager')} placeholder="+359..." />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IBAN за плащания">
            <input className={`${input} font-tech`} value={f.iban} onChange={set('iban')} placeholder="BG.." />
          </Field>
          <Field label="Банка">
            <input className={input} value={f.bankName} onChange={set('bankName')} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-red">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-line">
        {initial && onDelete && (
          <DeleteButton className="mr-auto" label="Изтрий сградата" onDelete={() => run(onDelete, onClose)} />
        )}
        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-mute hover:text-ink">
          Отказ
        </button>
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
          <Field label="Номер">
            <input className={input} value={a.number} onChange={set('number')} />
          </Field>
          <Field label="Етаж">
            <input type="number" className={input} value={a.floor} onChange={set('floor', true)} />
          </Field>
          <Field label="Вход">
            <input className={input} value={a.entrance ?? ''} onChange={set('entrance')} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Кв. м">
            <input type="number" className={input} value={a.areaSqM} onChange={set('areaSqM', true)} />
          </Field>
          <Field label="Стаи">
            <input type="number" className={input} value={a.rooms} onChange={set('rooms', true)} />
          </Field>
          <Field label="Статус">
            <select className={input} value={a.status} onChange={set('status')}>
              <option value="vacant">Свободен</option>
              <option value="occupied">Зает</option>
              <option value="under_repair">В ремонт</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Наемател">
            <input className={input} value={a.tenantName ?? ''} onChange={set('tenantName')} />
          </Field>
          <Field label="Телефон на наемателя">
            <input className={input} value={a.tenantPhone ?? ''} onChange={set('tenantPhone')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Наем €/мес.">
            <input type="number" className={input} value={a.monthlyRent} onChange={set('monthlyRent', true)} />
          </Field>
          <Field label="Такса поддръжка €/мес.">
            <input type="number" className={input} value={a.monthlyMaintenanceFee} onChange={set('monthlyMaintenanceFee', true)} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-3 border-t border-line">
        {initial && onDelete && (
          <DeleteButton
            className="mr-auto"
            onDelete={() => {
              onDelete(initial.id);
              onClose();
            }}
          />
        )}
        <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-mute hover:text-ink">
          Отказ
        </button>
        <button
          disabled={!a.number.trim()}
          onClick={() => {
            onSave(a);
            onClose();
          }}
          className={primaryBtn}
        >
          Запази
        </button>
      </div>
    </Modal>
  );
};

export const MembersPanel: React.FC<{
  members: Member[];
  onAdd: (m: { name?: string; phone?: string; email?: string; role: UserRole; apartmentNumber?: string }) => Promise<unknown>;
  onRemove: (member: Member) => Promise<unknown>;
}> = ({ members, onAdd, onRemove }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
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
          Добави наемател, строител или майстор по име, телефон или имейл (имейлът не е задължителен). Наемателят влиза през „Влез като наемател“ с някое от въведените тук данни.
        </p>
      </div>

      <form
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_140px_90px_auto] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              onAdd({
                name,
                phone,
                email,
                role,
                apartmentNumber: role === 'tenant' ? apt : undefined,
              }),
            () => {
              setName('');
              setPhone('');
              setEmail('');
              setApt('');
            }
          );
        }}
      >
        <Field label="Име">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Петров" />
        </Field>
        <Field label="Телефон">
          <input type="tel" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0888123456" />
        </Field>
        <Field label="Имейл (по избор)">
          <input type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="по избор" />
        </Field>
        <Field label="Роля">
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {(['tenant', 'builder', 'craftsman'] as UserRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ап.">
          <input className={input} value={apt} disabled={role !== 'tenant'} required={role === 'tenant'} onChange={(e) => setApt(e.target.value)} placeholder="Напр. 5" />
        </Field>
        <button type="submit" disabled={busy} className={primaryBtn}>
          Добави
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}

      <ul className="divide-y divide-line">
        {members.map((m) => {
          const joined = Boolean(m.uid || (m.uids && m.uids.length > 0));
          const displayTitle = m.name || m.phone || m.email || 'Поканен участник';
          const subtitle = [m.phone, m.email].filter(Boolean).join(' · ');
          return (
            <li key={`${m.inviteId ?? m.uid ?? ''}-${m.email}-${m.phone ?? ''}`} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-ink font-medium truncate flex items-center gap-2">
                  <span>{displayTitle}</span>
                  {m.role !== 'owner' && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        joined ? 'bg-stamp-soft text-stamp border-stamp' : 'bg-film text-mute border-line'
                      }`}
                    >
                      {joined ? 'Присъединен' : 'Чака вход'}
                    </span>
                  )}
                </div>
                {subtitle && <div className="text-mute truncate">{subtitle}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-ink">
                  {ROLE_LABELS[m.role]}
                  {m.apartmentNumber ? ` · Ап. ${m.apartmentNumber}` : ''}
                </span>
                {m.role !== 'owner' && (
                  <button
                    onClick={() => run(() => onRemove(m))}
                    aria-label={`Премахни ${displayTitle}`}
                    className="text-mute hover:text-red"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// Full-page state before the user belongs to any building.
export const AccessGate: React.FC<{
  name: string;
  email: string;
  isAnonymous?: boolean;
  onCreateBuilding?: (fields: BuildingFields) => Promise<unknown>;
  onClaimByIdentifier?: (identifier: string) => Promise<number>;
  onRecheck: () => void;
  onLogout: () => void;
}> = ({ name, email, isAnonymous, onCreateBuilding, onClaimByIdentifier, onRecheck, onLogout }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [lookupInput, setLookupInput] = useState('');
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const { error, busy, run } = useSave();

  return (
    <div className="max-w-lg w-full mx-4 rounded-2xl border border-line bg-sheet p-6 space-y-4 text-xs">
      <h2 className="text-base font-bold text-ink flex items-center gap-2">
        <Building2 className="w-5 h-5 text-mat" /> Добре дошъл в Building Brain
      </h2>
      <p className="text-ink leading-relaxed">
        {isAnonymous ? (
          <>Влязъл си като наемател ({name}). Въведи телефона, името или имейла си, за да намериш сградите си.</>
        ) : (
          <>
            Влезли сте с имейл <b>{email}</b>. Създайте нова сграда или се присъединете към сграда, в която собственик ви е добавил.
          </>
        )}
      </p>

      {onClaimByIdentifier && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setLookupMsg(null);
            if (!lookupInput.trim()) return;
            run(async () => {
              const count = await onClaimByIdentifier(lookupInput.trim());
              if (count === 0) {
                throw new Error('Не намерихме сграда с тези данни. Провери имейла, телефона или името.');
              }
              setLookupMsg(`Намерихме ${count} сграда/и и те добавихме.`);
            });
          }}
        >
          <input
            className={input}
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="Имейл, телефон или име в сградата…"
          />
          <button type="submit" disabled={busy || !lookupInput.trim()} className={`${primaryBtn} inline-flex items-center gap-1.5 shrink-0`}>
            <Search className="w-3.5 h-3.5" />
            <span>Намери</span>
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      {lookupMsg && <p className="text-stamp font-semibold">{lookupMsg}</p>}

      <div className="flex flex-wrap gap-2.5">
        {onCreateBuilding && !isAnonymous && (
          <button onClick={() => setIsFormOpen(true)} disabled={busy} className={primaryBtn}>
            Създай сграда
          </button>
        )}
        <button onClick={onRecheck} disabled={busy} className="px-3 py-2 text-xs font-medium text-mat hover:text-ink">
          Провери за покана
        </button>
      </div>
      <div className="pt-2 border-t border-line">
        <button onClick={onLogout} className="text-mute hover:text-ink">
          Изход от профила
        </button>
      </div>
      {isFormOpen && onCreateBuilding && <BuildingFormModal onSave={onCreateBuilding} onClose={() => setIsFormOpen(false)} />}
    </div>
  );
};
