import React, { useState } from 'react';
import { 
  Receipt, 
  Plus, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Download, 
  X, 
  Check, 
  ShieldCheck,
  TrendingDown,
  Building2
} from 'lucide-react';
import { ExpenseRecord, UserProfile } from '../types';
import { isoDay, monthLabel } from '../format';
import { DeleteButton } from './PhotoPicker';

interface ExpensesViewProps {
  currentUser: UserProfile;
  expenses: ExpenseRecord[];
  reserveFundBalance: number;
  onAddExpense: (expense: Omit<ExpenseRecord, 'id'>) => void;
  onApproveExpense: (expenseId: string) => void;
  onDeleteExpense?: (expenseId: string) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  currentUser,
  expenses,
  reserveFundBalance,
  onAddExpense,
  onApproveExpense,
  onDeleteExpense,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState(150);
  const [newVendor, setNewVendor] = useState('');
  const [newInvoiceNumber, setNewInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-`);
  const [newCategory, setNewCategory] = useState<ExpenseRecord['category']>('repair');

  const thisMonth = isoDay(new Date()).slice(0, 7);
  const monthExpenses = expenses.filter((e) => e.date?.startsWith(thisMonth));
  const totalSpent = monthExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  const getCategoryLabel = (category: ExpenseRecord['category']) => {
    switch (category) {
      case 'cleaning': return 'Почистване';
      case 'elevator_service': return 'Асансьорна поддръжка';
      case 'repair': return 'Текущ ремонт';
      case 'landscaping': return 'Озеленяване & Двор';
      case 'security': return 'Охрана & Видеонаблюдение';
      case 'utilities': return 'Консумативи общи части';
      // Unknown values (old rows, AI output) must not crash the page
      default: return String(category ?? '—');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight">
            Разходи и фонд „Ремонт“
          </h2>
          <p className="text-xs text-mute mt-0.5">
            Къде отидоха парите на сградата. С фактура за всеки лев.
          </p>
        </div>

        {currentUser.role === 'owner' && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors shadow-sm border border-mat/40"
          >
            <Plus className="w-4 h-4 text-stamp" />
            <span>Добави разход / фактура</span>
          </button>
        )}
      </div>

      {/* Financial Health Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-sheet border border-stamp  relative overflow-hidden">
          <div className="flex items-center justify-between text-ink text-xs mb-1">
            <span>Наличност във Фонд Ремонт:</span>
            <ShieldCheck className="w-4 h-4 text-stamp" />
          </div>
          <div className="text-2xl font-bold font-tech tabular-nums text-ink">
            {reserveFundBalance.toLocaleString('bg-BG')} €
          </div>
          <p className="text-[11px] text-stamp mt-1 font-medium">
            Резервен буфер на сградата
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-sheet border border-ochre ">
          <div className="flex items-center justify-between text-ink text-xs mb-1">
            <span>Разходи за {monthLabel(new Date()).toLowerCase()}:</span>
            <TrendingDown className="w-4 h-4 text-ink" />
          </div>
          <div className="text-2xl font-bold font-tech tabular-nums text-ink">
            {totalSpent.toLocaleString('bg-BG')} €
          </div>
          <p className="text-[11px] text-mute mt-1">
            {monthExpenses.length} отчетени фактури и ордери
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-sheet border border-line ">
          <div className="flex items-center justify-between text-ink text-xs mb-1">
            <span>Прогнозен остатък в края на месеца:</span>
            <Building2 className="w-4 h-4 text-mat" />
          </div>
          <div className="text-2xl font-bold font-tech tabular-nums text-mat">
            {(reserveFundBalance - 420).toLocaleString('bg-BG')} €
          </div>
          <p className="text-[11px] text-mute mt-1">
            Всички планирани такси покриват разходите
          </p>
        </div>
      </div>

      {/* Expenses Ledger Table */}
      <div className="rounded-2xl border border-line bg-sheet overflow-hidden ">
        <div className="p-4 border-b border-line flex items-center justify-between bg-sheet">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Receipt className="w-4 h-4 text-mat" />
            <span>Дневник на разходите и фактурите</span>
          </h3>
          <span className="text-xs text-ink font-tech px-2 py-0.5 rounded bg-hi-soft border border-ochre">
            Всички периоди
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-line bg-raise text-ink text-[11px]">
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Дата</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Основание & Категория</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Изпълнител / Доставчик</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Фактура №</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Сума (€)</th>
                <th className="py-3 px-4 font-semibold uppercase tracking-wider">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-sheet transition-colors">
                  <td className="py-3 px-4 font-tech text-ink text-[11px]">
                    {exp.date}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-ink">
                      {exp.title}
                    </div>
                    <div className="text-[11px] text-mute">
                      {getCategoryLabel(exp.category)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-ink font-medium">
                    {exp.vendor}
                  </td>
                  <td className="py-3 px-4 font-tech text-mat text-[11px]">
                    {exp.invoiceNumber}
                  </td>
                  <td className="py-3 px-4 text-right font-tech font-bold tabular-nums text-ink text-sm">
                    {exp.amount.toLocaleString('bg-BG', { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="py-3 px-4">
                    {exp.status === 'paid' ? (
                      <span className="text-stamp flex items-center gap-1 font-semibold text-[11px] px-2 py-0.5 rounded bg-stamp-soft border border-stamp w-fit">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Платено</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-ink text-[11px] px-2 py-0.5 rounded bg-hi-soft border border-ochre">Одобрено</span>
                        {currentUser.role === 'owner' && (
                          <button
                            onClick={() => onApproveExpense(exp.id)}
                            className="px-2 py-0.5 text-[10px] font-semibold bg-mat hover:bg-mat-deep text-white rounded border border-mat/40 transition-colors"
                          >
                            Маркирай платено
                          </button>
                        )}
                      </div>
                    )}
                    {currentUser.role === 'owner' && onDeleteExpense && (
                      <DeleteButton className="mt-1 !px-2 !py-0.5 !text-[10px]" onDelete={() => onDeleteExpense(exp.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/45">
          <div className="relative w-full max-w-lg rounded-2xl bg-sheet border border-line p-6  space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-mat" />
                <h3 className="text-base font-bold text-ink">
                  Добавяне на фактура или разход за сградата
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-ink hover:text-ink p-1 rounded hover:bg-raise"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-ink mb-1 font-medium">Основание / Описание на разхода</label>
                <input
                  type="text"
                  placeholder="Напр.: Смяна на филтри и профилактика"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink focus:outline-none focus:border-mat"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink mb-1 font-medium">Категория</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink focus:outline-none focus:border-mat"
                  >
                    <option value="repair">Ремонт</option>
                    <option value="elevator_service">Асансьор</option>
                    <option value="cleaning">Почистване</option>
                    <option value="landscaping">Озеленяване</option>
                    <option value="utilities">Консумативи</option>
                    <option value="security">Охрана</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink mb-1 font-medium">Сума (€)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:outline-none focus:border-mat"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink mb-1 font-medium">Доставчик / Изпълнител</label>
                  <input
                    type="text"
                    placeholder="Напр. Лифт Сервиз София"
                    value={newVendor}
                    onChange={(e) => setNewVendor(e.target.value)}
                    className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink focus:outline-none focus:border-mat"
                  />
                </div>
                <div>
                  <label className="block text-ink mb-1 font-medium">Фактура №</label>
                  <input
                    type="text"
                    value={newInvoiceNumber}
                    onChange={(e) => setNewInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-film border border-line rounded-lg text-ink font-tech focus:outline-none focus:border-mat"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-ink hover:text-ink"
              >
                Отказ
              </button>
              <button
                onClick={() => {
                  if (!newTitle.trim()) return;
                  onAddExpense({
                    buildingId: currentUser.buildingId,
                    title: newTitle,
                    category: newCategory,
                    amount: newAmount,
                    date: new Date().toISOString().split('T')[0],
                    vendor: newVendor || 'Термо & ВиК Сервиз',
                    invoiceNumber: newInvoiceNumber,
                    status: 'paid',
                    approvedByOwner: true,
                  });
                  setIsAddModalOpen(false);
                  setNewTitle('');
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-mat hover:bg-mat-deep rounded-lg transition-colors shadow-sm border border-mat/40"
              >
                Запази разхода
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
