import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { UserRole, AIDailySummary, Building, PaymentObligation, RepairTicket, CalendarEvent } from '../types';

interface DailySummaryBannerProps {
  role: UserRole;
  userName: string;
  building: Building;
  payments: PaymentObligation[];
  repairTickets: RepairTicket[];
  calendarEvents: CalendarEvent[];
  onNavigateTab: (tab: string, highlightItemId?: string) => void;
}

const eur = (n: number) => `${Math.round(n).toLocaleString('bg-BG')} €`;
const isOpen = (r: RepairTicket) => r.status !== 'completed' && r.status !== 'rejected';

// Built from this building's real data (already filtered by role on the server), so it is never stale or someone else's.
export function buildSummary(
  role: UserRole,
  building: Building,
  payments: PaymentObligation[],
  repairs: RepairTicket[],
  events: CalendarEvent[],
  today = new Date().toISOString().slice(0, 10)
): AIDailySummary {
  const waiting = payments.filter((p) => p.status === 'pending_verification' || p.status === 'declared_paid');
  const overdue = payments.filter((p) => p.status === 'overdue');
  const unpaid = payments.filter((p) => p.status === 'unpaid' || p.status === 'overdue' || p.status === 'partially_paid');
  const open = repairs.filter(isOpen);
  const needBudget = repairs.filter((r) => r.status === 'reported');
  const paidSum = payments.filter((p) => p.status === 'confirmed_paid').reduce((s, p) => s + (p.paidAmount ?? p.amount), 0);

  const repairItem = (r: RepairTicket, actionLabel: string) => ({
    id: r.id, type: 'repair' as const, title: r.title, subtitle: `${r.locationDetail || 'Общи части'} · ${r.ticketNumber}`, actionLabel, targetTab: 'repairs',
  });
  const payItem = (p: PaymentObligation, actionLabel: string) => ({
    id: p.id, type: 'payment' as const, title: `${p.title} · ап. ${p.apartmentNumber}`, subtitle: `${eur(p.paidAmount ?? p.amount)} · ${p.tenantName} · срок ${p.dueDate}`, actionLabel, targetTab: 'payments',
  });

  const urgentItems =
    role === 'owner'
      ? [...waiting.map((p) => payItem(p, 'Провери')), ...overdue.map((p) => payItem(p, 'Виж')), ...needBudget.map((r) => repairItem(r, 'Одобри'))]
      : role === 'tenant'
        ? [...unpaid.map((p) => payItem(p, 'Плати')), ...open.filter((r) => r.apartmentNumber).map((r) => repairItem(r, 'Виж'))]
        : open.map((r) => repairItem(r, 'Отвори'));

  const keyMetrics =
    role === 'owner'
      ? [
          { label: 'Събрани плащания', value: eur(paidSum) },
          { label: 'Чака теб', value: waiting.length, alert: waiting.length > 0 },
          { label: 'Просрочено', value: eur(overdue.reduce((s, p) => s + p.amount, 0)), alert: overdue.length > 0 },
          { label: 'Отворени ремонти', value: open.length },
        ]
      : role === 'tenant'
        ? [
            { label: 'За плащане', value: eur(unpaid.reduce((s, p) => s + p.amount, 0)), alert: unpaid.length > 0 },
            { label: 'Чака потвърждение', value: waiting.length },
            { label: 'Моите сигнали', value: open.filter((r) => r.apartmentNumber).length },
          ]
        : [
            { label: 'Отворени ремонти', value: open.length },
            { label: 'Спешни', value: open.filter((r) => r.priority === 'urgent').length, alert: open.some((r) => r.priority === 'urgent') },
          ];

  const upcomingToday = events
    .filter((e) => e.startDateTime?.startsWith(today) && e.status !== 'cancelled')
    .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime))
    .map((e) => `${e.startDateTime.slice(11, 16)} — ${e.title}`);

  const headline = urgentItems.length
    ? `${urgentItems.length === 1 ? '1 нещо чака' : `${urgentItems.length} неща чакат`} внимание в „${building.name}“.`
    : `В „${building.name}“ всичко е наред днес.`;

  return {
    headline,
    keyMetrics,
    urgentItems: urgentItems.slice(0, 5),
    insights: role === 'owner' ? [`Във фонд „Ремонт“ има ${eur(building.reserveFundBalance)}.`] : [],
    upcomingToday: upcomingToday.length ? upcomingToday : ['Нищо насрочено за днес.'],
  };
}

export const DailySummaryBanner: React.FC<DailySummaryBannerProps> = ({
  role,
  userName,
  building,
  payments,
  repairTickets,
  calendarEvents,
  onNavigateTab,
}) => {
  const summary = useMemo(
    () => buildSummary(role, building, payments, repairTickets, calendarEvents),
    [role, building, payments, repairTickets, calendarEvents]
  );

  return (
    <section className="rounded-[10px] border border-line bg-sheet p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-tech text-[13px] uppercase tracking-[0.08em] text-mute">
          Днес накратко · {userName.split(' ')[0]}
        </h2>
      </div>

      <p className="mt-3 max-w-[60ch] text-lg md:text-xl font-semibold leading-snug text-ink">
        {summary.headline}
      </p>

      {/* Figures with drafting dimension lines under them. */}
      <dl className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 border-t border-line pt-4">
        {summary.keyMetrics.map((metric, idx) => (
          <div key={idx} className="min-w-0">
            <dt className="truncate font-tech text-[12px] uppercase tracking-[0.05em] text-mute">{metric.label}</dt>
            <dd className={`font-tech text-[24px] leading-tight ${metric.alert ? 'text-red' : 'text-ink'}`}>
              {metric.alert ? <span className="hl text-ink">{metric.value}</span> : metric.value}
            </dd>
            <span className="relative mt-1 block h-2 max-w-[180px] border-x border-mute/60" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 border-t border-mute/60" />
            </span>
            {metric.change && <span className="mt-1 block text-[11.5px] text-stamp">{metric.change}</span>}
          </div>
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <h3 className="font-tech text-[12px] uppercase tracking-[0.08em] text-mute">Какво чака теб</h3>
          <ol className="mt-1">
            {summary.urgentItems.map((item) => (
              <li key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line py-3 first:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[13px] text-mute">{item.subtitle}</p>
                </div>
                <button
                  onClick={() => onNavigateTab(item.targetTab, item.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {item.actionLabel}
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-5 grid gap-4 content-start">
          <div>
            <h3 className="font-tech text-[12px] uppercase tracking-[0.08em] text-mute">График за днес</h3>
            <ul className="mt-2 space-y-1.5 text-[13.5px] text-ink">
              {summary.upcomingToday.map((event, idx) => {
                const [time, ...rest] = event.split(' — ');
                return (
                  <li key={idx} className="flex items-baseline gap-2.5">
                    {rest.length ? (
                      <>
                        <span className="hl font-tech text-[13px]">{time}</span>
                        <span className="leading-snug">{rest.join(' — ')}</span>
                      </>
                    ) : (
                      <span className="leading-snug">{event}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Margin notes: what the assistant noticed, set apart with the dashed "not yet confirmed" line. */}
          {summary.insights.length > 0 && (
          <div className="rounded-lg border-[1.5px] border-dashed border-ink/40 p-3.5">
            <h3 className="font-tech text-[12px] uppercase tracking-[0.08em] text-mute">Бележки в полето</h3>
            <ul className="mt-1.5 space-y-1 text-[13px] text-ink">
              {summary.insights.map((insight, idx) => (
                <li key={idx} className="flex items-baseline gap-2">
                  <span className="text-red" aria-hidden>—</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </div>
      </div>
    </section>
  );
};
