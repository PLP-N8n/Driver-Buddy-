import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { DatePicker } from './DatePicker';
import { Plus, Tag, Trash2, ChevronUp, ChevronDown, Upload, Image as ImageIcon, X, Eye, Search, Sparkles, Loader2, AlertCircle, Percent, Fuel, Wrench, Shield, Landmark, ClipboardCheck, Ticket, MoreHorizontal } from 'lucide-react';
import { analyzeReceipt } from '../services/geminiService';

interface ExpenseLogProps {
  expenses: Expense[];
  onAddExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

// Helper to map categories to icons
const getCategoryIcon = (category: ExpenseCategory) => {
  switch (category) {
    case ExpenseCategory.FUEL: return Fuel;
    case ExpenseCategory.REPAIRS: return Wrench;
    case ExpenseCategory.INSURANCE: return Shield;
    case ExpenseCategory.TAX: return Landmark;
    case ExpenseCategory.MOT: return ClipboardCheck;
    case ExpenseCategory.CLEANING: return Sparkles;
    case ExpenseCategory.PARKING: return Ticket;
    case ExpenseCategory.OTHER: return MoreHorizontal;
    default: return Tag;
  }
};

export const ExpenseLog: React.FC<ExpenseLogProps> = ({ expenses, onAddExpense, onDeleteExpense }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  
  // Initialize new expense with FUEL as default category
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    date: new Date().toISOString().split('T')[0],
    category: ExpenseCategory.FUEL,
    amount: 0,
    description: '',
    receiptUrl: '',
    isVatClaimable: false,
    liters: undefined
  });

  const processReceipt = async (base64: string, mimeType: string) => {
    setIsScanning(true);
    const data = await analyzeReceipt(base64, mimeType);
    setIsScanning(false);

    if (data) {
      setNewExpense(prev => ({
        ...prev,
        amount: data.amount || prev.amount,
        date: data.date || prev.date,
        description: data.description || prev.description,
        // Basic category matching
        category: (Object.values(ExpenseCategory).find(c => 
          data.category?.toLowerCase().includes(c.toLowerCase())
        ) || prev.category || ExpenseCategory.FUEL) as ExpenseCategory
      }));
    }
  };

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setNewExpense(prev => ({ ...prev, receiptUrl: base64 }));
      setIsFormOpen(true);
      await processReceipt(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File is too large.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setNewExpense(prev => ({ ...prev, receiptUrl: base64 }));
        await processReceipt(base64, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeReceipt = () => {
    setNewExpense({ ...newExpense, receiptUrl: '' });
  };

  const openFuelForm = () => {
    setNewExpense({
      date: new Date().toISOString().split('T')[0],
      category: ExpenseCategory.FUEL,
      amount: 0,
      description: 'Fuel Station',
      receiptUrl: '',
      isVatClaimable: true, // Fuel usually has VAT
      liters: 0
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.amount || !newExpense.date) return;

    onAddExpense({
      id: Date.now().toString(),
      date: newExpense.date!,
      category: (newExpense.category as ExpenseCategory) || ExpenseCategory.FUEL,
      amount: parseFloat(newExpense.amount.toString()),
      description: newExpense.description || '',
      receiptUrl: newExpense.receiptUrl,
      isVatClaimable: newExpense.isVatClaimable || false,
      liters: newExpense.liters ? parseFloat(newExpense.liters.toString()) : undefined
    });

    // Reset form with FUEL as default category
    setNewExpense({
      date: new Date().toISOString().split('T')[0],
      category: ExpenseCategory.FUEL,
      amount: 0,
      description: '',
      receiptUrl: '',
      isVatClaimable: false,
      liters: undefined
    });
    setIsFormOpen(false);
    setIsCategoryOpen(false);
  };

  const confirmDelete = () => {
    if (expenseToDelete) {
      onDeleteExpense(expenseToDelete);
      setExpenseToDelete(null);
    }
  };

  const filteredExpenses = expenses.filter(expense => {
    const query = searchQuery.toLowerCase();
    return (
      expense.description.toLowerCase().includes(query) ||
      expense.category.toLowerCase().includes(query)
    );
  });

  const CurrentCategoryIcon = getCategoryIcon(newExpense.category || ExpenseCategory.FUEL);

  return (
    <div className="space-y-6">
      <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-4">
        <div className="relative group flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm shadow-sm"
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
           <button
            onClick={openFuelForm}
            className="bg-blue-600 text-white px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-md hover:bg-blue-700 transition-all transform active:scale-95"
            title="Quick Fuel Entry"
          >
            <Fuel size={18} />
            <span className="hidden sm:inline">Log Fuel</span>
          </button>

          <div className="relative">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleScanReceipt} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              title="AI Scan Receipt"
            />
            <button className="bg-white border border-emerald-200 text-emerald-700 px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm hover:bg-emerald-50 transition-all">
              <Sparkles size={18} className="text-emerald-500" />
              Scan
            </button>
          </div>
          
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-emerald-600 text-white px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all transform active:scale-95"
          >
            {isFormOpen ? <ChevronUp size={18} /> : <Plus size={18} />}
            Manual
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-100 animate-slide-down relative overflow-visible">
           {isScanning && (
             <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-4 rounded-2xl">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
                  <Sparkles className="absolute inset-0 m-auto text-emerald-600 animate-pulse" size={24} />
                </div>
                <p className="font-bold text-slate-800">Gemini 3 Pro scanning receipt...</p>
                <p className="text-xs text-slate-500">Extracting vendor, amount, and date.</p>
             </div>
           )}
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
           
          <form onSubmit={handleSubmit} className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <DatePicker 
                  label="Date"
                  value={newExpense.date || ''}
                  onChange={(date) => setNewExpense({ ...newExpense, date })}
                />
              </div>
              
              {/* Custom Category Dropdown */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                <button
                  type="button"
                  onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                  className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between hover:bg-white focus:ring-2 focus:ring-emerald-500 transition-all text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <CurrentCategoryIcon size={18} className="text-emerald-600" />
                    <span className="font-medium text-slate-700">{newExpense.category || ExpenseCategory.FUEL}</span>
                  </div>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isCategoryOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95">
                    <div className="p-1">
                      {Object.values(ExpenseCategory).map(cat => {
                        const CatIcon = getCategoryIcon(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setNewExpense({ ...newExpense, category: cat });
                              setIsCategoryOpen(false);
                            }}
                            className={`w-full p-2.5 text-left rounded-lg flex items-center gap-3 transition-colors ${newExpense.category === cat ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50 text-slate-700'}`}
                          >
                            <div className={`p-1.5 rounded-lg ${newExpense.category === cat ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                              <CatIcon size={16} />
                            </div>
                            <span className="text-sm font-medium">{cat}</span>
                            {newExpense.category === cat && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amount (Gross £)</label>
                 <div className="relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">£</span>
                   <input
                    type="number"
                    step="0.01"
                    required
                    value={newExpense.amount || ''}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })}
                    className="w-full pl-8 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-emerald-700 font-bold text-lg"
                  />
                 </div>
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
                 <input
                  type="text"
                  placeholder={newExpense.category === ExpenseCategory.FUEL ? "e.g. Shell Station" : "Description"}
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Liters Input for Fuel */}
            {newExpense.category === ExpenseCategory.FUEL && (
               <div className="animate-in fade-in slide-in-from-top-1 bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                     <div>
                       <label className="block text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Fuel size={12} /> Fuel Volume (Liters)
                       </label>
                       <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={newExpense.liters || ''}
                        onChange={(e) => setNewExpense({ ...newExpense, liters: parseFloat(e.target.value) })}
                        className="w-full p-3 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-700 bg-white"
                      />
                     </div>
                     <div className="text-xs text-blue-600">
                        <p>Entering liters helps calculate your MPG efficiency.</p>
                     </div>
                  </div>
               </div>
            )}

            {/* VAT Toggle */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg text-slate-500 border border-slate-200">
                     <Percent size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">VAT Reclaimable</p>
                    <p className="text-xs text-slate-400">Enable if you reclaim VAT on this item.</p>
                  </div>
               </div>
               <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={newExpense.isVatClaimable}
                    onChange={(e) => setNewExpense({...newExpense, isVatClaimable: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Receipt Image</label>
              {!newExpense.receiptUrl ? (
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 hover:bg-emerald-50 hover:border-emerald-400 transition-all text-center relative">
                  <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex flex-col items-center">
                    <Upload className="w-8 h-8 mb-2 text-slate-400" />
                    <span className="text-sm font-bold text-slate-500">Upload Receipt</span>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block border border-slate-200 rounded-xl overflow-hidden group shadow-md">
                   <img src={newExpense.receiptUrl} alt="Preview" className="h-40 w-auto object-cover" />
                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <button type="button" onClick={removeReceipt} className="bg-white text-red-500 p-2 rounded-full shadow-lg hover:scale-110">
                        <X size={20} />
                      </button>
                   </div>
                </div>
              )}
            </div>

            <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition-all">
              Log Expense
            </button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {filteredExpenses.map(expense => {
          const CategoryIcon = getCategoryIcon(expense.category);
          return (
            <div key={expense.id} className="bg-white rounded-xl p-5 border border-l-4 border-l-emerald-400 border-slate-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{expense.date}</span>
                  <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 px-2 py-1 rounded flex items-center gap-1.5 border border-emerald-100">
                    <CategoryIcon size={12} />
                    {expense.category}
                  </span>
                  {expense.isVatClaimable && (
                     <span className="text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-1 rounded flex items-center gap-1">
                        <Percent size={10} /> VAT
                     </span>
                  )}
                  {expense.liters && (
                     <span className="text-[10px] font-bold uppercase text-orange-700 bg-orange-50 px-2 py-1 rounded flex items-center gap-1">
                        <Fuel size={10} /> {expense.liters} L
                     </span>
                  )}
                </div>
                <p className="text-slate-800 font-bold">{expense.description || expense.category}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-lg font-black text-slate-800">£{expense.amount.toFixed(2)}</span>
                {expense.receiptUrl && (
                  <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="text-emerald-500 hover:text-emerald-700"><Eye size={18} /></a>
                )}
                <button 
                  onClick={() => setExpenseToDelete(expense.id)} 
                  className="text-slate-300 hover:text-red-500 transition-colors"
                  title="Delete expense"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 animate-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Delete Expense?</h3>
              <p className="text-sm text-slate-500">
                Are you sure you want to remove this record? This action cannot be undone.
              </p>
            </div>
            <div className="bg-slate-50 p-4 flex gap-3">
              <button 
                onClick={() => setExpenseToDelete(null)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-500/30 transition-all transform active:scale-95 text-sm"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};