import React, { useState, useMemo } from 'react';
import { Settings, Debt, DailyWorkLog } from '../types';
import { CreditCard, ArrowDown, ArrowUp, Plus, Trash2, TrendingDown, Calendar, PoundSterling, Target, Wallet, AlertCircle, Percent, CheckCircle } from 'lucide-react';

interface DebtManagerProps {
  settings: Settings;
  dailyLogs: DailyWorkLog[];
  onUpdateSettings: (settings: Settings) => void;
}

export const DebtManager: React.FC<DebtManagerProps> = ({ settings, dailyLogs, onUpdateSettings }) => {
  const [newDebt, setNewDebt] = useState<Partial<Debt>>({ name: '', balance: 0, apr: 0, minPayment: 0 });

  // Analytics for Projection
  const analysis = useMemo(() => {
    const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);
    const uniqueDays = new Set(dailyLogs.map(l => l.date)).size || 1;
    const avgDailyRevenue = totalRevenue / uniqueDays;
    
    // Estimate monthly allocation: Avg Daily * 22 working days * Allocation %
    const projectedMonthlyAllocation = (avgDailyRevenue * 22) * (settings.debtSetAsidePercent / 100);
    
    const totalDebt = (settings.debts || []).reduce((sum, d) => sum + d.balance, 0);
    const totalMinPayments = (settings.debts || []).reduce((sum, d) => sum + d.minPayment, 0);
    
    // Simple payoff calc (ignoring compound interest reduction for speed/simplicity of UI)
    const effectiveMonthlyPayment = Math.max(projectedMonthlyAllocation, totalMinPayments);
    const monthsToFreedom = effectiveMonthlyPayment > 0 ? totalDebt / effectiveMonthlyPayment : 0;
    
    return {
        totalDebt,
        projectedMonthlyAllocation,
        totalMinPayments,
        monthsToFreedom,
        isAllocationSufficient: projectedMonthlyAllocation >= totalMinPayments
    };
  }, [dailyLogs, settings.debts, settings.debtSetAsidePercent]);

  const handleAddDebt = () => {
    if (!newDebt.name || !newDebt.balance) return;
    const debt: Debt = {
      id: Date.now().toString(),
      name: newDebt.name,
      balance: parseFloat(newDebt.balance.toString()),
      apr: parseFloat(newDebt.apr?.toString() || '0'),
      minPayment: parseFloat(newDebt.minPayment?.toString() || '0')
    };
    onUpdateSettings({
      ...settings,
      debts: [...(settings.debts || []), debt]
    });
    setNewDebt({ name: '', balance: 0, apr: 0, minPayment: 0 });
  };

  const handleDeleteDebt = (id: string) => {
    onUpdateSettings({
      ...settings,
      debts: (settings.debts || []).filter(d => d.id !== id)
    });
  };

  // Payoff Strategy Logic
  // Avalanche: High Interest (APR) First -> Descending APR
  // Snowball: Small Balance First -> Ascending Balance
  const sortedDebts = [...(settings.debts || [])].sort((a, b) => {
    if (settings.debtStrategy === 'AVALANCHE') return b.apr - a.apr; // Descending APR
    return a.balance - b.balance; // Ascending Balance
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
       
       {/* Hero Section */}
       <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Target size={240} />
          </div>
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8">
             <div>
                <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
                   <Wallet className="text-purple-400" /> Debt Freedom
                </h2>
                <p className="text-purple-200 mb-8 max-w-md">
                   Track your liabilities and use your daily work performance to crush them. 
                   Your <strong>{settings.debtSetAsidePercent}%</strong> allocation rule is powering this plan.
                </p>

                <div className="flex gap-6">
                   <div>
                      <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">Total Balance</p>
                      <p className="text-4xl font-black tracking-tight">£{analysis.totalDebt.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                   </div>
                   <div>
                      <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">Freedom In</p>
                      <p className="text-4xl font-black tracking-tight flex items-baseline gap-1">
                         {analysis.monthsToFreedom === 0 && analysis.totalDebt > 0 
                            ? '∞' 
                            : analysis.monthsToFreedom < 1 && analysis.totalDebt > 0 
                                ? '< 1' 
                                : analysis.monthsToFreedom.toFixed(1)} 
                         <span className="text-base font-medium text-purple-300">months</span>
                      </p>
                   </div>
                </div>
             </div>

             <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-4">
                   <span className="font-bold text-purple-200">Monthly Power (Est.)</span>
                   <span className="font-bold text-xl">£{analysis.projectedMonthlyAllocation.toFixed(2)}</span>
                </div>
                <div className="w-full bg-black/20 rounded-full h-3 mb-2 overflow-hidden">
                   <div 
                     className={`h-full rounded-full ${analysis.isAllocationSufficient ? 'bg-emerald-400' : 'bg-red-400'}`} 
                     style={{ width: `${Math.min((analysis.projectedMonthlyAllocation / (analysis.totalMinPayments || 1)) * 100, 100)}%` }}
                   />
                </div>
                <div className="flex justify-between text-xs font-medium">
                   <span className={analysis.isAllocationSufficient ? "text-emerald-300" : "text-red-300"}>
                      {analysis.isAllocationSufficient ? 'Covers Minimums' : 'Below Minimums'}
                   </span>
                   <span className="text-purple-300">Min Req: £{analysis.totalMinPayments.toFixed(2)}</span>
                </div>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Strategy & Add Column */}
          <div className="lg:col-span-1 space-y-6">
             
             {/* Allocation Config */}
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Percent size={18} className="text-purple-500" /> Allocation %
                 </h3>
                 <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Daily Revenue Share</span>
                        <span className="font-bold text-purple-600">{settings.debtSetAsidePercent}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="50" step="1" 
                      value={settings.debtSetAsidePercent} 
                      onChange={(e) => onUpdateSettings({...settings, debtSetAsidePercent: parseInt(e.target.value)})}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <p className="text-xs text-slate-400">
                      Percentage of every shift automatically assigned to debt repayment.
                    </p>
                 </div>
             </div>
             
             {/* Strategy Card */}
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <TrendingDown size={18} className="text-blue-500" /> Payoff Strategy
                 </h3>
                 <div className="flex gap-2">
                    <button
                      onClick={() => onUpdateSettings({ ...settings, debtStrategy: 'AVALANCHE' })}
                      className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${settings.debtStrategy === 'AVALANCHE' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}
                    >
                       <ArrowDown size={18} />
                       <span className="font-bold text-xs uppercase">Avalanche</span>
                       <span className="text-[10px] opacity-70">High Interest First</span>
                    </button>
                    <button
                      onClick={() => onUpdateSettings({ ...settings, debtStrategy: 'SNOWBALL' })}
                      className={`flex-1 p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${settings.debtStrategy === 'SNOWBALL' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}
                    >
                       <ArrowUp size={18} />
                       <span className="font-bold text-xs uppercase">Snowball</span>
                       <span className="text-[10px] opacity-70">Small Balance First</span>
                    </button>
                 </div>
             </div>

             {/* Add Debt Card */}
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Plus size={18} className="text-emerald-500" /> Add Liability
                 </h3>
                 <div className="space-y-3">
                    <input 
                      placeholder="Name (e.g. Van Finance)" 
                      value={newDebt.name}
                      onChange={(e) => setNewDebt({...newDebt, name: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                       <input 
                          placeholder="Balance (£)" 
                          type="number"
                          value={newDebt.balance || ''}
                          onChange={(e) => setNewDebt({...newDebt, balance: parseFloat(e.target.value)})}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                        <input 
                          placeholder="APR (%)" 
                          type="number"
                          value={newDebt.apr || ''}
                          onChange={(e) => setNewDebt({...newDebt, apr: parseFloat(e.target.value)})}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <input 
                      placeholder="Min Payment (£)" 
                      type="number"
                      value={newDebt.minPayment || ''}
                      onChange={(e) => setNewDebt({...newDebt, minPayment: parseFloat(e.target.value)})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    <button 
                      onClick={handleAddDebt}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      Add Tracker
                    </button>
                 </div>
             </div>
          </div>

          {/* List Column */}
          <div className="lg:col-span-2 space-y-4">
             <div className="flex justify-between items-center">
               <h3 className="font-bold text-slate-700 uppercase text-xs tracking-wider flex items-center gap-2">
                  Priority Queue ({settings.debtStrategy})
               </h3>
               {sortedDebts.length > 0 && (
                 <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded-lg font-bold">
                   {sortedDebts.length} Active Debts
                 </span>
               )}
             </div>
             
             {sortedDebts.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
                   <CreditCard size={48} className="text-slate-300 mb-4" />
                   <h4 className="font-bold text-slate-600">Debt Free?</h4>
                   <p className="text-slate-400 text-sm max-w-xs mt-1">
                      If you have no debts, congratulations! You can allocate your funds to Savings or Maintenance instead.
                   </p>
                </div>
             ) : (
                <div className="space-y-3">
                   {sortedDebts.map((debt, index) => {
                      const isPriority = index === 0;
                      return (
                      <div key={debt.id} className={`bg-white p-5 rounded-xl border ${isPriority ? 'border-purple-300 shadow-md ring-1 ring-purple-100' : 'border-slate-200 shadow-sm'} flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-purple-300 transition-all relative overflow-hidden`}>
                         
                         {/* Priority Ribbon for #1 */}
                         {isPriority && (
                           <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none overflow-hidden">
                              <div className="absolute top-[10px] right-[-24px] rotate-45 bg-purple-500 text-white text-[9px] font-bold py-1 w-28 text-center shadow-sm">
                                FOCUS
                              </div>
                           </div>
                         )}

                         <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isPriority ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-slate-100 text-slate-500'}`}>
                               {index + 1}
                            </div>
                            <div>
                               <h4 className={`font-bold ${isPriority ? 'text-purple-900' : 'text-slate-800'}`}>{debt.name}</h4>
                               <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${settings.debtStrategy === 'AVALANCHE' && isPriority ? 'bg-red-100 text-red-700 font-bold' : 'bg-slate-100'}`}>
                                    <TrendingDown size={10} /> {debt.apr}% APR
                                  </span>
                                  <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded"><Calendar size={10} /> Min: £{debt.minPayment}</span>
                               </div>
                            </div>
                         </div>
                         
                         <div className="flex items-center justify-between sm:justify-end gap-6 pl-14 sm:pl-0">
                            <div className="text-right">
                               <p className={`text-lg font-black ${isPriority ? 'text-purple-700' : 'text-slate-800'}`}>£{debt.balance.toFixed(2)}</p>
                               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remaining</p>
                            </div>
                            <button 
                               onClick={() => handleDeleteDebt(debt.id)}
                               className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                               title="Remove Debt"
                            >
                               <Trash2 size={18} />
                            </button>
                         </div>
                      </div>
                   )})}
                </div>
             )}
          </div>
       </div>
    </div>
  );
};