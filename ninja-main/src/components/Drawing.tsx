import React from 'react';
import { Apartment, PaymentObligation, RepairTicket } from '../types';

/** Datum mark from an elevation drawing: the level triangle standing on a highlighted line. */
export const Logo: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <path d="M3 25h26" stroke="var(--color-hi)" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M8.5 13.5h15L16 25z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M16 4v9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/** Red-pen revision cloud drawn around whatever it sits in (parent must be relative). */
export const Cloud: React.FC<{ i?: number }> = ({ i = 0 }) => (
  <svg
    className="cloud pointer-events-none absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] overflow-visible"
    viewBox="0 0 100 60"
    preserveAspectRatio="none"
    aria-hidden
    style={{ '--i': i } as React.CSSProperties}
  >
    <path
      pathLength={1}
      d="M5 8q7.5-7 15 0q7.5-7 15 0q7.5-7 15 0q7.5-7 15 0q7.5-7 15 0q7.5-7 15 0q6 5 0 15q6 5 0 15q6 4 0 14q-7.5 7-15 0q-7.5 7-15 0q-7.5 7-15 0q-7.5 7-15 0q-7.5 7-15 0q-7.5 7-15 0q-6-5 0-15q-6-5 0-15q-6-4 0-14z"
      fill="none"
      stroke="var(--color-red)"
      strokeWidth="1.7"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

/** Round violet ink stamp, the mark for anything confirmed. */
export const Stamp: React.FC<{ children: React.ReactNode; i?: number }> = ({ children, i = 0 }) => (
  <span
    className="stamp pointer-events-none absolute right-2 top-2 grid w-[42px] h-[42px] place-items-center rounded-full border-2 border-stamp text-center font-tech text-[9.5px] uppercase leading-none text-stamp"
    style={{ '--i': i } as React.CSSProperties}
    aria-hidden
  >
    {children}
  </span>
);

/** Drafting dimension line: a rule with end ticks, set under a figure. */
export const Dim: React.FC = () => (
  <span className="relative mt-1 block h-2 max-w-[180px] border-x border-mute/60" aria-hidden>
    <span className="absolute inset-x-0 top-1/2 border-t border-mute/60" />
  </span>
);

const PENDING = ['declared_paid', 'pending_verification', 'partially_paid'];

/**
 * The building as its section drawing: floors as rows, flats as cells.
 * Overdue rent or an open repair gets a red revision cloud; confirmed rent gets the stamp;
 * rent waiting for the owner's check is drawn with a dashed line under the flat number.
 */
export const SectionDrawing: React.FC<{
  apartments: Apartment[];
  payments: PaymentObligation[];
  repairs: RepairTicket[];
  onOpen: (tab: string, id?: string) => void;
}> = ({ apartments, payments, repairs, onOpen }) => {
  const floors = new Map<number, Apartment[]>();
  for (const a of [...apartments].sort((x, y) => y.floor - x.floor || Number(x.number) - Number(y.number)))
    floors.set(a.floor, [...(floors.get(a.floor) ?? []), a]);
  // The latest obligation per flat decides its mark.
  const payBy = new Map<string, PaymentObligation>();
  for (const p of payments) if (!payBy.has(p.apartmentNumber)) payBy.set(p.apartmentNumber, p);
  const openRepairs = new Map<string, number>();
  for (const r of repairs)
    if (r.status !== 'completed' && r.status !== 'rejected' && r.apartmentNumber)
      openRepairs.set(r.apartmentNumber, (openRepairs.get(r.apartmentNumber) ?? 0) + 1);
  const cols = Math.max(1, ...[...floors.values()].map((l) => l.length));
  let mark = 0; // staggers the clouds and stamps as they draw in

  return (
    <div className="section-drawing">
      <div className="hatch-roof ml-[52px] h-5 border-b-2 border-ink" aria-hidden />
      {[...floors.entries()].map(([floor, list]) => (
        <div key={floor} className="grid grid-cols-[52px_1fr] border-b-2 border-ink">
          <div className="flex items-center border-r-2 border-ink font-tech text-[13px] text-mute">ет. {floor}</div>
          <div className="grid border-r-2 border-ink" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {list.map((a) => {
              const p = payBy.get(a.number);
              const open = openRepairs.get(a.number) ?? 0;
              const vacant = a.status !== 'occupied';
              const overdue = p?.status === 'overdue';
              const pending = !!p && PENDING.includes(p.status);
              const note = vacant
                ? 'свободен'
                : overdue
                  ? `просрочен · ${p!.amount.toLocaleString('bg-BG')} €`
                  : open
                    ? open === 1 ? '1 ремонт' : `${open} ремонта`
                    : pending
                      ? 'за проверка'
                      : (a.tenantName ?? '').split(' ').at(-1);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => (overdue || pending ? onOpen('payments', p!.id) : open ? onOpen('repairs') : onOpen('buildings'))}
                  aria-label={`Ап. ${a.number}: ${note}`}
                  className={`flat relative block min-h-[76px] border-l border-line px-3.5 py-3 text-left first:border-l-0 hover:bg-white ${vacant ? 'text-mute' : 'text-ink'}`}
                >
                  <b className={`font-tech text-[22px] leading-none ${pending ? 'border-b-2 border-dashed border-ink' : ''}`}>{a.number}</b>
                  <span className={`mt-1.5 block truncate pr-10 text-[12.5px] ${overdue ? 'font-semibold text-red' : 'text-mute'}`}>{note}</span>
                  {(overdue || open > 0) && <Cloud i={mark++} />}
                  {p?.status === 'confirmed_paid' && <Stamp i={mark++}>пла-<br />тено</Stamp>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="hatch-ground ml-[52px] h-3" aria-hidden />
    </div>
  );
};

export const Legend: React.FC = () => (
  <span className="flex flex-wrap items-center gap-4 text-[12.5px] text-mute">
    <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full border-2 border-stamp" /> платено</span>
    <span className="flex items-center gap-1.5"><i className="w-4 border-b-2 border-dashed border-ink" /> за проверка</span>
    <span className="flex items-center gap-1.5">
      <svg viewBox="0 0 20 12" className="h-3 w-5" aria-hidden><path d="M2 6q0-3 3-3q1-2 4-1q3-2 5 0q4 0 4 3q2 2 0 4q-1 2-4 1q-2 2-5 0q-3 1-4-1q-3 0-3-3z" fill="none" stroke="var(--color-red)" strokeWidth="1.3" /></svg>
      проблем
    </span>
  </span>
);
