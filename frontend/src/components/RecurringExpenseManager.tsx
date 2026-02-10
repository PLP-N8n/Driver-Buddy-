import React, { useState } from 'react';
import { RecurringExpense, ExpenseCategory, RecurringFrequency } from '../types';
import { Plus, Repeat, Trash2, ToggleLeft, ToggleRight, PenLine, X, CalendarClock, PoundSterling, Tag } from 'lucide-react';

interface RecurringExpenseManagerProps {
  recurringExpenses: RecurringExpense[];
  onAdd: (item: RecurringExpense) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
};

const FREQUENCY_COLORS: Record<RecurringFrequency, string> = {
  weekly: 'bg-violet-50 text-violet-700 border-violet-200',
  monthly: 'bg-sky-50 text-sky-700 border-sky-200',
  annual: 'bg-amber-50 text-amber-700 border-amber-200',
};

const CATEGORY_OPTIONS = Object.values(ExpenseCategory);

const emptyForm = (): Omit<RecurringExpense, 'id' | 'lastGeneratedDate' | 'isActive'> => ({
  category: ExpenseCategory.INSURANCE,
  amount: 0,
  description: '',
  frequency: 'monthly',
  startDate: new Date().toISOString().split('T')[0],
  isVatClaimable: false,
});

export const RecurringExpenseManager: React.FC<RecurringExpenseManagerProps> = ({
  recurringExpenses, onAdd, onDelete, onToggle,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const handleSubmit = () => {
    if (!form.description.trim() || form.amount <= 0) return;
    onAdd({
      ...form,
      id: Date.now().toString() + '_rec',
      lastGeneratedDate: null,
      isActive: true,
    });
    setForm(emptyForm());
    setShowForm(false);
  };

  const activeCount = recurringExpenses.filter(r => r.isActive).length;
  const monthlyTotal = recurringExpenses
    .filter(r => r.isActive)
    .reduce((sum, r) => {
      if (r.frequency === 'weekly') return sum + r.amount * 4.33;
      if (r.frequency === 'monthly') return sum + r.amount;
      if (r.frequency === 'annual') return sum + r.amount / 12;
      return sum;
    }, 0);

  return (
    <div className="space-y-5" data-testid="recurring-expenses-section">
      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Repeat className="w-4 h-4 text-indigo-500" /> Recurring Expenses
          </h4>
          <button
            data-testid="add-recurring-btn"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? 'Cancel' : 'Add Template'}
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Set up recurring costs (insurance, phone, vehicle tax). They'll auto-generate as expenses each period.
        </p>

        {/* Summary Pills */}
        <div className="flex gap-3 mb-5">
          <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-100 flex-1 text-center">
            <p className="text-xl font-black text-slate-800">{activeCount}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Active</p>
          </div>
          <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-100 flex-1 text-center">
            <p className="text-xl font-black text-emerald-600">£{monthlyTotal.toFixed(2)}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Monthly Est.</p>
          </div>
        </div>

        {/* Add Form */}
        {showForm && (
          <div data-testid="recurring-form" className="bg-white p-5 rounded-xl border border-indigo-100 shadow-md mb-5 space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="absolute-top-bar w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-xl -mt-5 -mx-5 mb-4" style={{ width: 'calc(100% + 2.5rem)', marginLeft: '-1.25rem', marginTop: '-1.25rem', borderRadius: '0.75rem 0.75rem 0 0' }} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  <Tag size={12} className="inline mr-1" />Description
                </label>
                <input
                  data-testid="recurring-description-input"
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Phone Plan, Insurance"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  <PoundSterling size={12} className="inline mr-1" />Amount (£)
                </label>
                <input
                  data-testid="recurring-amount-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount || ''}
                  onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                <select
                  data-testid="recurring-category-select"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {CATEGORY_OPTIONS.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  <CalendarClock size={12} className="inline mr-1" />Frequency
                </label>
                <select
                  data-testid="recurring-frequency-select"
                  value={form.frequency}
                  onChange={e => setForm({ ...form, frequency: e.target.value as RecurringFrequency })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start Date</label>
                <input
                  data-testid="recurring-start-date-input"
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  data-testid="recurring-vat-checkbox"
                  type="checkbox"
                  checked={form.isVatClaimable}
                  onChange={e => setForm({ ...form, isVatClaimable: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                VAT Claimable
              </label>

              <button
                data-testid="recurring-save-btn"
                onClick={handleSubmit}
                disabled={!form.description.trim() || form.amount <= 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center gap-2"
              >
                <Plus size={16} /> Add Recurring
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {recurringExpenses.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Repeat size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No recurring expenses yet</p>
            <p className="text-xs mt-1">Add templates for costs that repeat regularly</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recurringExpenses.map(item => (
              <div
                key={item.id}
                data-testid={`recurring-item-${item.id}`}
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  item.isActive
                    ? 'bg-white border-slate-100 shadow-sm'
                    : 'bg-slate-50 border-slate-100 opacity-60'
                }`}
              >
                {/* Toggle */}
                <button
                  data-testid={`recurring-toggle-${item.id}`}
                  onClick={() => onToggle(item.id)}
                  className="shrink-0"
                  title={item.isActive ? 'Pause' : 'Resume'}
                >
                  {item.isActive
                    ? <ToggleRight size={28} className="text-indigo-500" />
                    : <ToggleLeft size={28} className="text-slate-400" />
                  }
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold truncate ${item.isActive ? 'text-slate-800' : 'text-slate-500 line-through'}`}>
                      {item.description}
                    </p>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${FREQUENCY_COLORS[item.frequency]}`}>
                      {FREQUENCY_LABELS[item.frequency]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.category} · Started {new Date(item.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {item.lastGeneratedDate && (
                      <> · Last generated {new Date(item.lastGeneratedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                    )}
                  </p>
                </div>

                {/* Amount */}
                <p className="text-sm font-black text-slate-700 shrink-0">£{item.amount.toFixed(2)}</p>

                {/* Delete */}
                <button
                  data-testid={`recurring-delete-${item.id}`}
                  onClick={() => onDelete(item.id)}
                  className="shrink-0 text-slate-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
