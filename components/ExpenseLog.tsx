import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  Fuel,
  PlugZap,
  Pencil,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { Expense, ExpenseCategory, EXPENSE_CATEGORY_OPTIONS, Settings } from '../types';
import { deleteImage, deleteRemoteReceipt, getImageWithRemoteFallback, saveImage } from '../services/imageStore';
import {
  calculateExpenseTaxClassification,
  getTaxDeductibleAmount,
  isVehicleRunningCostCategory,
} from '../shared/calculations/expenses';
import type { Expense as EnhancedExpense } from '../shared/types/expense';
import { DatePicker } from './DatePicker';
import { EmptyState } from './EmptyState';
import { ReceiptStatusBadge } from './ReceiptStatusBadge';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { getSimplifiedMileageDeductibleExplanation } from '../utils/simplifiedMileageDeductibleCopy';
import { suggestCategory } from '../utils/expenseCategorySuggestions';
import { todayUK, UK_TZ, ukTaxYearEnd, ukTaxYearStart } from '../utils/ukDate';
import {
  formatEnergyQuantity,
  getEnergyQuantityLabel,
  getEnergyQuantityUnitForCategory,
  getVehicleEnergyExpenseCategory,
  getVehicleEnergyExpenseDescription,
  getVehicleEnergyExpenseLabel,
} from '../utils/vehicleFuel';
import {
  dangerButtonClasses,
  dialogBackdropClasses,
  dialogPanelClasses,
  fieldLabelClasses,
  formatCurrency,
  getNumericInputProps,
  iconButtonClasses,
  inputClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  selectClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
} from '../utils/ui';

type ExpenseRecord = Expense & Partial<Omit<EnhancedExpense, keyof Expense>>;

interface ExpenseLogProps {
  expenses: ExpenseRecord[];
  settings: Settings;
  onAddExpense: (expense: ExpenseRecord) => void;
  onUpdateExpense: (expense: ExpenseRecord) => void;
  onDeleteExpense: (id: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  openFormSignal?: number;
  openFormDefaults?: {
    date?: string;
    linkedShiftId?: string;
  };
  onOpenFormHandled?: () => void;
}

const EXPENSE_FILTER_KEY = 'dtpro_expense_filter';

type ReceiptPreviewInput = {
  id: string;
  receiptUrl?: string;
  sourceKey: string;
};

type ReceiptUrlCacheEntry = {
  blobKey: string;
  sourceKey: string;
  url: string;
};

const getReceiptSourceKey = (expense: ExpenseRecord) =>
  `${expense.id}:${expense.receiptId ?? expense.receiptUrl ?? (expense.hasReceiptImage ? 'local-receipt' : 'no-receipt')}`;

const getStoredDeductibleAmount = (expense: ExpenseRecord) => {
  return getTaxDeductibleAmount(expense);
};

const getReceiptBlobKey = async (expenseId: string, blob: Blob) => {
  const fingerprintBase = `${expenseId}:${blob.size}:${blob.type}`;
  if (!globalThis.crypto?.subtle) return fingerprintBase;

  const buffer = await blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const digestHex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);

  return `${fingerprintBase}:${digestHex}`;
};

const categoryMeta: Record<ExpenseCategory, { icon: typeof Fuel; circle: string }> = {
  [ExpenseCategory.FUEL]: { icon: Fuel, circle: 'bg-amber-500/20 text-amber-400' },
  [ExpenseCategory.PUBLIC_CHARGING]: { icon: PlugZap, circle: 'bg-emerald-500/20 text-emerald-300' },
  [ExpenseCategory.HOME_CHARGING]: { icon: PlugZap, circle: 'bg-cyan-500/20 text-cyan-300' },
  [ExpenseCategory.REPAIRS]: { icon: Wrench, circle: 'bg-indigo-500/20 text-indigo-400' },
  [ExpenseCategory.INSURANCE]: { icon: ShieldCheck, circle: 'bg-green-500/20 text-green-400' },
  [ExpenseCategory.TAX]: { icon: Receipt, circle: 'bg-red-500/20 text-red-400' },
  [ExpenseCategory.MOT]: { icon: Receipt, circle: 'bg-cyan-500/20 text-cyan-400' },
  [ExpenseCategory.CLEANING]: { icon: Sparkles, circle: 'bg-slate-500/20 text-slate-300' },
  [ExpenseCategory.PARKING]: { icon: Receipt, circle: 'bg-violet-500/20 text-violet-400' },
  [ExpenseCategory.PHONE]: { icon: Receipt, circle: 'bg-sky-500/20 text-sky-300' },
  [ExpenseCategory.ACCOUNTANCY]: { icon: Receipt, circle: 'bg-emerald-500/20 text-emerald-300' },
  [ExpenseCategory.SUBSCRIPTIONS]: { icon: Receipt, circle: 'bg-fuchsia-500/20 text-fuchsia-300' },
  [ExpenseCategory.PROTECTIVE_CLOTHING]: { icon: Receipt, circle: 'bg-orange-500/20 text-orange-300' },
  [ExpenseCategory.TRAINING]: { icon: Receipt, circle: 'bg-teal-500/20 text-teal-300' },
  [ExpenseCategory.BANK_CHARGES]: { icon: Receipt, circle: 'bg-rose-500/20 text-rose-300' },
  [ExpenseCategory.OTHER]: { icon: Receipt, circle: 'bg-slate-500/20 text-slate-300' },
};

const createDefaultExpenseDraft = (): Partial<ExpenseRecord> => ({
  date: todayUK(),
  category: ExpenseCategory.FUEL,
  amount: 0,
  description: '',
  receiptUrl: '',
  hasReceiptImage: false,
  isVatClaimable: false,
  liters: undefined,
});

function TaxYearDeductibleCallout({ expenses, settings }: { expenses: ExpenseRecord[]; settings: Settings }) {
  const taxYearStart = ukTaxYearStart();
  const taxYearEnd = ukTaxYearEnd();
  const taxYearExpenses = expenses.filter(
    (expense) =>
      expense.date >= taxYearStart &&
      expense.date <= taxYearEnd &&
      !(isVehicleRunningCostCategory(expense.category) && expense.taxTreatment === undefined)
  );

  if (taxYearExpenses.length === 0) return null;

  const totalDeductible = taxYearExpenses.reduce(
    (sum, expense) => sum + getStoredDeductibleAmount(expense),
    0
  );
  const simplifiedMileageExplanation = getSimplifiedMileageDeductibleExplanation(
    taxYearExpenses.map((expense) => ({
      category: expense.category,
      deductibleAmount: getStoredDeductibleAmount(expense),
      scope: expense.scope,
      taxTreatment: expense.taxTreatment,
    })),
    settings
  );

  return (
    <section className="rounded-xl border border-green-500/20 bg-green-950/30 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tax year deductible</p>
      {simplifiedMileageExplanation ? (
        <p className="mt-2 text-sm font-medium text-green-200">{simplifiedMileageExplanation}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-xl font-bold text-green-400">{formatCurrency(totalDeductible)}</span>
          <span className="text-sm text-slate-400">
            across {taxYearExpenses.length} expense{taxYearExpenses.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </section>
  );
}

function MonthlySummaryBar({ expenses }: { expenses: ExpenseRecord[] }) {
  const monthKey = todayUK().slice(0, 7);
  const monthExpenses = expenses.filter((expense) => expense.date.startsWith(monthKey));

  if (monthExpenses.length === 0) return null;

  const totalSpend = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};

  monthExpenses.forEach((expense) => {
    byCategory[expense.category] = (byCategory[expense.category] ?? 0) + expense.amount;
  });

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{monthLabel}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xl font-bold text-red-400">{formatCurrency(totalSpend)} spent</span>
        <span className="text-sm text-slate-400">
          {monthExpenses.length} expense{monthExpenses.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.entries(byCategory) as [ExpenseCategory, number][])
          .sort((left, right) => right[1] - left[1])
          .map(([category, amount]) => (
            <span key={category} className={`rounded-full px-3 py-1 text-xs font-medium ${(categoryMeta[category] ?? { circle: 'bg-slate-500/20 text-slate-400' }).circle}`}>
              {category} {formatCurrency(amount)}
            </span>
          ))}
      </div>
    </section>
  );
}

export const ExpenseLog: React.FC<ExpenseLogProps> = ({
  expenses,
  settings,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  showToast,
  openFormSignal,
  openFormDefaults,
  onOpenFormHandled,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'All' | ExpenseCategory>(() => {
    const stored = sessionStorage.getItem(EXPENSE_FILTER_KEY);
    return stored === 'All' || EXPENSE_CATEGORY_OPTIONS.includes(stored as ExpenseCategory)
      ? (stored as 'All' | ExpenseCategory) || 'All'
      : 'All';
  });
  const [newExpense, setNewExpense] = useState<Partial<ExpenseRecord>>(createDefaultExpenseDraft());
  const [amountInput, setAmountInput] = useState('');
  const [litersInput, setLitersInput] = useState('');
  const [pricePerLitreInput, setPricePerLitreInput] = useState('');
  const [scopeInput, setScopeInput] = useState<'business' | 'personal' | 'mixed'>('business');
  const [businessUsePercentInput, setBusinessUsePercentInput] = useState(100);
  const [selectedReceiptBlob, setSelectedReceiptBlob] = useState<Blob | null>(null);
  const [isReceiptRemoved, setIsReceiptRemoved] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const receiptUrlsRef = useRef<Record<string, ReceiptUrlCacheEntry>>({});
  const receiptUpload = useReceiptUpload({
    onUploadFailed: () => {
      showToast?.('Receipt upload failed - saved locally. Retry from the expense row.', 'warning');
    },
  });
  const energyExpenseCategory = getVehicleEnergyExpenseCategory(settings);
  const energyExpenseLabel = getVehicleEnergyExpenseLabel(settings);
  const energyExpenseDescription = getVehicleEnergyExpenseDescription(settings);
  const selectedEnergyUnit = getEnergyQuantityUnitForCategory((newExpense.category as ExpenseCategory) || ExpenseCategory.FUEL);
  const selectedEnergyQuantityLabel = selectedEnergyUnit ? getEnergyQuantityLabel(selectedEnergyUnit) : '';
  const previousExpensesRef = useRef<Map<string, ExpenseRecord>>(new Map());
  const handledOpenFormSignalRef = useRef<number | undefined>(undefined);
  const receiptPreviewState = useMemo(() => {
    const dirtyIds = new Set<string>();
    const inputs: ReceiptPreviewInput[] = expenses
      .filter((expense) => expense.hasReceiptImage)
      .map((expense) => {
        if (previousExpensesRef.current.get(expense.id) !== expense) {
          dirtyIds.add(expense.id);
        }

        return {
          id: expense.id,
          receiptUrl: expense.receiptUrl,
          sourceKey: getReceiptSourceKey(expense),
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));

    return {
      dirtyIds,
      inputs,
    };
  }, [expenses]);

  const filteredExpenses = useMemo(
    () =>
      [...expenses]
        .filter((expense) => activeFilter === 'All' || expense.category === activeFilter)
        .sort((left, right) => right.date.localeCompare(left.date)),
    [activeFilter, expenses]
  );

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    const syncReceiptUrls = async () => {
      const nextEntries: Record<string, ReceiptUrlCacheEntry> = { ...receiptUrlsRef.current };
      const activeIds = new Set(receiptPreviewState.inputs.map((input) => input.id));
      let didChange = false;

      for (const [expenseId, entry] of Object.entries(nextEntries)) {
        if (activeIds.has(expenseId)) continue;
        URL.revokeObjectURL(entry.url);
        delete nextEntries[expenseId];
        didChange = true;
      }

      for (const input of receiptPreviewState.inputs) {
        const existingEntry = nextEntries[input.id];
        const shouldRefresh = !existingEntry || receiptPreviewState.dirtyIds.has(input.id);

        if (!shouldRefresh) {
          continue;
        }

        const blob = await getImageWithRemoteFallback(input.id, input.receiptUrl);
        if (!blob) {
          if (existingEntry) {
            URL.revokeObjectURL(existingEntry.url);
            delete nextEntries[input.id];
            didChange = true;
          }
          continue;
        }

        const blobKey = await getReceiptBlobKey(input.id, blob);

        if (cancelled) {
          return;
        }

        if (existingEntry && existingEntry.blobKey === blobKey) {
          nextEntries[input.id] = {
            ...existingEntry,
            sourceKey: input.sourceKey,
          };
          didChange = true;
          continue;
        }

        const nextUrl = URL.createObjectURL(blob);
        createdUrls.push(nextUrl);
        if (existingEntry) {
          URL.revokeObjectURL(existingEntry.url);
        }

        nextEntries[input.id] = {
          blobKey,
          sourceKey: input.sourceKey,
          url: nextUrl,
        };
        didChange = true;
      }

      if (cancelled || !didChange) {
        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
        }
        return;
      }

      receiptUrlsRef.current = nextEntries;
      setReceiptUrls(
        Object.fromEntries(Object.entries(nextEntries).map(([expenseId, entry]) => [expenseId, entry.url]))
      );
    };

    void syncReceiptUrls();

    return () => {
      cancelled = true;
    };
  }, [receiptPreviewState]);

  useEffect(() => {
    previousExpensesRef.current = new Map(expenses.map((expense) => [expense.id, expense]));
  }, [expenses]);

  useEffect(
    () => () => {
      Object.values(receiptUrlsRef.current).forEach((entry) => URL.revokeObjectURL(entry.url));
      receiptUrlsRef.current = {};
    },
    []
  );

  useEffect(() => {
    if (!openFormSignal || handledOpenFormSignalRef.current === openFormSignal) return;
    handledOpenFormSignalRef.current = openFormSignal;
    closeForm();
    setNewExpense({
      ...createDefaultExpenseDraft(),
      date: openFormDefaults?.date ?? todayUK(),
      linkedShiftId: openFormDefaults?.linkedShiftId ?? null,
    });
    setIsFormOpen(true);
    onOpenFormHandled?.();
  }, [onOpenFormHandled, openFormDefaults, openFormSignal]);
  useEffect(() => {
    sessionStorage.setItem(EXPENSE_FILTER_KEY, activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    if (!editingExpense) return;
    const existingReceiptUrl = receiptUrls[editingExpense.id];
    if (!existingReceiptUrl) return;

    setNewExpense((current) => {
      if (current.receiptUrl === existingReceiptUrl || selectedReceiptBlob || isReceiptRemoved) {
        return current;
      }

      return {
        ...current,
        receiptUrl: existingReceiptUrl,
      };
    });
  }, [editingExpense, isReceiptRemoved, receiptUrls, selectedReceiptBlob]);

  const resetForm = () => {
    setNewExpense(createDefaultExpenseDraft());
    setAmountInput('');
    setLitersInput('');
    setPricePerLitreInput('');
    setScopeInput('business');
    setBusinessUsePercentInput(100);
    setSelectedReceiptBlob(null);
    setIsReceiptRemoved(false);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingExpense(null);
    resetForm();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setReceiptError('Receipt image must be under 5 MB.');
      return;
    }
    setReceiptError(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedReceiptBlob(file);
      setIsReceiptRemoved(false);
      setNewExpense((current) => ({
        ...current,
        receiptUrl: reader.result as string,
        hasReceiptImage: true,
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const openEdit = (expense: ExpenseRecord) => {
    setEditingExpense(expense);
    setSelectedReceiptBlob(null);
    setIsReceiptRemoved(false);
    setNewExpense({
      ...expense,
      receiptUrl: receiptUrls[expense.id] ?? '',
      hasReceiptImage: expense.hasReceiptImage,
    });
    setAmountInput(expense.amount ? expense.amount.toString() : '');
    setLitersInput((expense.energyQuantity ?? expense.liters) ? String(expense.energyQuantity ?? expense.liters) : '');
    setScopeInput(expense.scope ?? 'business');
    setBusinessUsePercentInput(expense.businessUsePercent ?? 100);
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!amountInput || !newExpense.date) return;

    const id = editingExpense?.id ?? Date.now().toString();

    let uploadResult: Awaited<ReturnType<typeof receiptUpload.upload>> | null = null;

    if (selectedReceiptBlob) {
      await saveImage(id, selectedReceiptBlob);
      uploadResult = await receiptUpload.upload(id, selectedReceiptBlob);
    } else if (isReceiptRemoved) {
      await deleteImage(id);
      if (editingExpense?.receiptId) {
        void deleteRemoteReceipt(editingExpense.receiptId);
      }
    }

    const hasReceiptImage = selectedReceiptBlob
      ? true
      : editingExpense
        ? !isReceiptRemoved && !!editingExpense.hasReceiptImage
        : false;

    const isMetadataOnlyEdit = editingExpense && !selectedReceiptBlob && !isReceiptRemoved;

    const category = (newExpense.category as ExpenseCategory) || ExpenseCategory.FUEL;
    const amount = parseFloat(amountInput) || 0;
    const energyUnit = getEnergyQuantityUnitForCategory(category);
    const energyQuantity = energyUnit && litersInput ? parseFloat(litersInput) : undefined;
    const scope = scopeInput;
    const businessUsePercent = scopeInput === 'personal' ? 0 : businessUsePercentInput;
    const isVatClaimable = newExpense.isVatClaimable || false;
    const taxClassification = calculateExpenseTaxClassification({
      amount,
      businessUsePercent,
      category,
      claimMethod: settings.claimMethod,
      isVatClaimable,
      scope,
    });

    const expenseData: ExpenseRecord = {
      id,
      date: newExpense.date,
      category,
      amount,
      description: newExpense.description || '',
      hasReceiptImage,
      isVatClaimable,
      energyQuantity: Number.isFinite(energyQuantity) && energyQuantity && energyQuantity > 0 ? energyQuantity : undefined,
      energyUnit: Number.isFinite(energyQuantity) && energyQuantity && energyQuantity > 0 ? energyUnit : undefined,
      liters: energyUnit === 'litre' && Number.isFinite(energyQuantity) && energyQuantity && energyQuantity > 0 ? energyQuantity : undefined,
      ...taxClassification,
      linkedShiftId: editingExpense?.linkedShiftId ?? newExpense.linkedShiftId ?? null,
      sourceType: editingExpense?.sourceType ?? 'manual',
      reviewStatus: editingExpense ? 'edited' : 'confirmed',
      ...(isMetadataOnlyEdit && {
        receiptId: editingExpense.receiptId,
        receiptUrl: editingExpense.receiptUrl,
      }),
      ...(uploadResult?.receiptId && {
        receiptId: uploadResult.receiptId,
      }),
    };

    if (editingExpense) {
      onUpdateExpense(expenseData);
    } else {
      onAddExpense(expenseData);
    }

    if (uploadResult?.status === 'local-only') {
      showToast?.('Receipt saved locally - will sync when cloud upload is available', 'info');
    }

    closeForm();
  };

  const formCategory = (newExpense.category as ExpenseCategory) || ExpenseCategory.FUEL;
  const categorySuggestion = suggestCategory(newExpense.description ?? '');
  const showCategorySuggestion = categorySuggestion !== null && categorySuggestion !== formCategory;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-surface-border bg-surface p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Expense log</h2>
            <p className="text-sm text-slate-400">
              Track fuel, charging, receipts, and running costs without double-claiming under simplified mileage.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                setSelectedReceiptBlob(null);
                setIsReceiptRemoved(false);
                setNewExpense({
                  date: todayUK(),
                  category: energyExpenseCategory,
                  amount: 0,
                  description: energyExpenseDescription,
                  receiptUrl: '',
                  hasReceiptImage: false,
                  isVatClaimable: false,
                  energyUnit: getEnergyQuantityUnitForCategory(energyExpenseCategory),
                  liters: 0,
                });
                setIsFormOpen(true);
              }}
              className={secondaryButtonClasses}
            >
              {energyExpenseCategory === ExpenseCategory.FUEL ? <Fuel className="h-4 w-4" /> : <PlugZap className="h-4 w-4" />}
              <span>Quick {energyExpenseLabel.toLowerCase()}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingExpense(null);
                resetForm();
                setIsFormOpen(true);
              }}
              className={primaryButtonClasses}
            >
              <Plus className="h-4 w-4" />
              <span>Add expense</span>
            </button>
          </div>
        </div>
      </section>

      <TaxYearDeductibleCallout expenses={expenses} settings={settings} />
      <MonthlySummaryBar expenses={expenses} />

      <section className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
        {(['All', ...EXPENSE_CATEGORY_OPTIONS] as Array<'All' | ExpenseCategory>).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`min-h-[44px] whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
              activeFilter === filter
                ? 'bg-brand text-white'
                : 'border border-surface-border bg-surface-raised text-slate-400'
            }`}
          >
            {filter}
          </button>
        ))}
      </section>

      <section className="space-y-3">
        {filteredExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={activeFilter === 'All' ? 'No expenses recorded' : `No ${activeFilter.toLowerCase()} expenses`}
            description={
              activeFilter === 'All'
                ? 'Add your first expense. Fuel, insurance, and repairs all reduce your tax bill.'
                : 'Try another category or switch back to all expenses.'
            }
            action={
              activeFilter === 'All'
                ? {
                    label: 'Add first expense',
                    onClick: () => {
                      setEditingExpense(null);
                      resetForm();
                      setIsFormOpen(true);
                    },
                  }
                : { label: 'Show all expenses', onClick: () => setActiveFilter('All') }
            }
          />
        ) : (
          filteredExpenses.map((expense) => {
            const meta = categoryMeta[expense.category] ?? { icon: Receipt, circle: 'bg-slate-500/20 text-slate-400' };
            const Icon = meta.icon;
            const energyQuantityText = formatEnergyQuantity(
              expense.energyQuantity ?? expense.liters,
              expense.energyUnit ?? getEnergyQuantityUnitForCategory(expense.category)
            );
            const receiptUrl = receiptUrls[expense.id];
            const uploadStatus =
              receiptUpload.getStatus(expense.id) ??
              (expense.receiptId ? 'synced' : expense.hasReceiptImage ? 'local-only' : null);

            return (
              <article
                key={expense.id}
                className="rounded-xl border border-white/6 bg-surface p-4 transition-all duration-200 hover:border-white/10 hover:bg-surface-raised/50"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.circle}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{expense.description || expense.category}</p>
                      {expense.isVatClaimable && (
                        <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-400">
                          VAT
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {expense.category} - {expense.date}
                      {energyQuantityText ? ` - ${energyQuantityText}` : ''}
                    </p>
                    {uploadStatus && uploadStatus !== 'pending' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ReceiptStatusBadge status={uploadStatus} />
                        {uploadStatus === 'failed' && (
                          <button
                            type="button"
                            onClick={() => void receiptUpload.retry(expense.id)}
                            className="text-xs font-medium text-brand hover:text-brand/80"
                          >
                            Retry upload
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="number-large glow-red text-red-400">{formatCurrency(expense.amount)}</p>
                    </div>
                    {receiptUrl && (
                      <img
                        src={receiptUrl}
                        alt={`Receipt thumbnail for ${expense.description || expense.category}`}
                        className="h-12 w-12 rounded-xl border border-surface-border object-cover"
                      />
                    )}
                    {receiptUrl && (
                      <a
                        href={receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View receipt for ${expense.description || expense.category}`}
                        className={secondaryButtonClasses}
                      >
                        <Eye className="h-4 w-4" />
                        <span className="hidden sm:inline">View</span>
                      </a>
                    )}
                    <button
                      type="button"
                      aria-label={`Edit expense from ${expense.date}`}
                      onClick={() => openEdit(expense)}
                      className={secondaryButtonClasses}
                      title="Edit expense"
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete expense from ${expense.date}`}
                      onClick={() => setExpenseToDelete(expense.id)}
                      className={dangerButtonClasses}
                      title="Delete expense"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {isFormOpen && (
        <div className={sheetBackdropClasses} onClick={closeForm}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingExpense ? 'Edit expense' : 'Add expense'}
            className={sheetPanelClasses}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{editingExpense ? 'Edit expense' : 'Add expense'}</h3>
                {!editingExpense && <p className="text-sm text-slate-400">Log the cost, category, and receipt image.</p>}
              </div>
              <button
                type="button"
                aria-label="Close expense form"
                onClick={closeForm}
                className={iconButtonClasses}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <DatePicker
                  id="expense-date"
                  label="Date"
                  value={newExpense.date || ''}
                  onChange={(date) => setNewExpense({ ...newExpense, date })}
                />
                <div className="block">
                  <label htmlFor="expense-category" className={fieldLabelClasses}>
                    Category
                  </label>
                  <select
                    id="expense-category"
                    value={newExpense.category}
                    onChange={(event) => setNewExpense({ ...newExpense, category: event.target.value as ExpenseCategory })}
                    className={selectClasses}
                  >
                    {EXPENSE_CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="block">
                  <label htmlFor="expense-amount" className={fieldLabelClasses}>
                    Amount
                  </label>
                  <input
                    id="expense-amount"
                    {...getNumericInputProps('decimal')}
                    value={amountInput}
                    onChange={(event) => {
                      setAmountInput(event.target.value);
                      if (selectedEnergyUnit === 'litre' && pricePerLitreInput && event.target.value) {
                        const litres = parseFloat(event.target.value) / (parseFloat(pricePerLitreInput) / 100);
                        if (Number.isFinite(litres) && litres > 0) setLitersInput(litres.toFixed(2));
                      }
                    }}
                    className={`${inputClasses} font-mono`}
                    placeholder="0.00"
                  />
                </div>
                <div className="block">
                  <label htmlFor="expense-description" className={fieldLabelClasses}>
                    Description
                  </label>
                  <input
                    id="expense-description"
                    type="text"
                    value={newExpense.description}
                    onChange={(event) => setNewExpense({ ...newExpense, description: event.target.value })}
                    className={inputClasses}
                    placeholder="Receipt details"
                  />
                  {showCategorySuggestion && (
                    <button
                      type="button"
                      onClick={() => setNewExpense({ ...newExpense, category: categorySuggestion! })}
                      className="mt-2 flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs text-brand transition-colors hover:bg-brand/20 active:scale-95"
                    >
                      <span>Looks like: {categorySuggestion}</span>
                      <span className="font-semibold">— use this?</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className={fieldLabelClasses}>Business use</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(['business', 'mixed', 'personal'] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => {
                        setScopeInput(scope);
                        if (scope === 'business') setBusinessUsePercentInput(100);
                        if (scope === 'personal') setBusinessUsePercentInput(0);
                        if (scope === 'mixed') setBusinessUsePercentInput(50);
                      }}
                      className={`min-h-[44px] rounded-full px-4 py-2 text-sm transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                        scopeInput === scope
                          ? 'bg-brand text-white'
                          : 'border border-surface-border bg-surface-raised text-slate-400'
                      }`}
                    >
                      {scope === 'business' ? '100% Business' : scope === 'personal' ? 'Personal' : 'Mixed use'}
                    </button>
                  ))}
                </div>
                {scopeInput === 'mixed' && (
                  <div className="mt-3">
                    <label htmlFor="expense-business-use" className={fieldLabelClasses}>
                      Business use: {businessUsePercentInput}%
                    </label>
                    <input
                      id="expense-business-use"
                      type="range"
                      min={1}
                      max={99}
                      value={businessUsePercentInput}
                      onChange={(event) => setBusinessUsePercentInput(Number(event.target.value))}
                      className="mt-1 w-full accent-brand"
                    />
                  </div>
                )}
                {scopeInput === 'personal' && (
                  <p className="mt-2 text-xs text-amber-400">
                    Personal expenses are not tax deductible.
                  </p>
                )}
              </div>

              {selectedEnergyUnit && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="block">
                    <label htmlFor="expense-liters" className={fieldLabelClasses}>
                      {selectedEnergyQuantityLabel}
                    </label>
                    <input
                      id="expense-liters"
                      {...getNumericInputProps('decimal')}
                      value={litersInput}
                      onChange={(event) => {
                        setLitersInput(event.target.value);
                        setPricePerLitreInput('');
                      }}
                      className={`${inputClasses} font-mono`}
                      placeholder="0.00"
                    />
                  </div>
                  {selectedEnergyUnit === 'litre' && (
                    <div className="block">
                      <label htmlFor="expense-ppl" className={fieldLabelClasses}>
                        Price per litre (p) - auto-calc litres
                      </label>
                      <input
                        id="expense-ppl"
                        {...getNumericInputProps('decimal')}
                        value={pricePerLitreInput}
                        onChange={(event) => {
                          const ppl = event.target.value;
                          setPricePerLitreInput(ppl);
                          if (ppl && amountInput) {
                            const litres = parseFloat(amountInput) / (parseFloat(ppl) / 100);
                            if (Number.isFinite(litres) && litres > 0) setLitersInput(litres.toFixed(2));
                          }
                        }}
                        className={`${inputClasses} font-mono`}
                        placeholder="e.g. 142.9"
                      />
                    </div>
                  )}
                </div>
              )}

              <label
                htmlFor="expense-vat"
                className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-raised px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">VAT registered business only</p>
                  <p className="text-xs text-slate-400">
                    Only tick if you are VAT registered and will reclaim this VAT via a VAT return. Most drivers should leave this off.
                  </p>
                </div>
                <input
                  id="expense-vat"
                  type="checkbox"
                  checked={!!newExpense.isVatClaimable}
                  onChange={(event) => setNewExpense({ ...newExpense, isVatClaimable: event.target.checked })}
                  className="h-4 w-4 rounded border-surface-border bg-surface text-brand focus:ring-brand"
                />
              </label>

              <div className="space-y-3">
                <label htmlFor="expense-receipt" className={fieldLabelClasses}>
                  Receipt image
                </label>
                {!newExpense.receiptUrl ? (
                  <label
                    htmlFor="expense-receipt"
                    className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-surface-border bg-surface-raised text-center text-slate-400 transition-colors duration-150 hover:border-brand"
                  >
                    <Upload className="mb-3 h-8 w-8" />
                    <span>Upload receipt</span>
                    <input
                      id="expense-receipt"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="relative inline-flex rounded-2xl border border-surface-border bg-surface-raised p-2">
                    <img
                      src={newExpense.receiptUrl}
                      alt="Receipt preview"
                      className="max-h-56 rounded-xl object-contain"
                    />
                    <button
                      type="button"
                      aria-label="Remove receipt image"
                      onClick={() => {
                        setSelectedReceiptBlob(null);
                        setIsReceiptRemoved(true);
                        setNewExpense({ ...newExpense, receiptUrl: '', hasReceiptImage: false });
                      }}
                      className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {receiptError && (
                <p className="text-sm text-danger">{receiptError}</p>
              )}

              <button type="submit" className={`${primaryButtonClasses} w-full`}>
                {editingExpense ? 'Save changes' : 'Save expense'}
              </button>
            </form>
          </div>
        </div>
      )}

      {expenseToDelete && (
        <div className={dialogBackdropClasses}>
          <div role="dialog" aria-modal="true" aria-label="Delete expense" className={`${dialogPanelClasses} max-w-sm`}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Delete expense?</h2>
              <p className="text-sm text-slate-400">This removes the receipt record permanently.</p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setExpenseToDelete(null)} className={secondaryButtonClasses}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const expense = expenses.find((item) => item.id === expenseToDelete);
                  void deleteImage(expenseToDelete);
                  if (expense?.receiptId) {
                    void deleteRemoteReceipt(expense.receiptId);
                  }
                  onDeleteExpense(expenseToDelete);
                  setExpenseToDelete(null);
                }}
                className={dangerButtonClasses}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
