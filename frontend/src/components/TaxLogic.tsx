import React, { useMemo, useState } from 'react';
import { Trip, Expense, DailyWorkLog, Settings, ExpenseCategory } from '../types';
import { Calculator, CheckCircle, XCircle, Info, TrendingUp, AlertTriangle, ArrowRight, Scale, BookOpen, PoundSterling, Download, ChevronDown, ChevronUp, BadgeCheck, Plus, Trash2 } from 'lucide-react';

interface TaxLogicProps {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
}

export const TaxLogic: React.FC<TaxLogicProps> = ({ trips, expenses, dailyLogs, settings, onUpdateSettings }) => {
  const [activeTab, setActiveTab] = useState<'simplified' | 'actual' | 'comparison'>('comparison');
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [newAllowance, setNewAllowance] = useState({ description: '', amount: '' });

  const analysis = useMemo(() => {
    // 1. Revenue
    const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);

    // 2. Mileage Stats
    const businessTrips = trips.filter(t => t.purpose === 'Business');
    const totalBusinessMiles = businessTrips.reduce((sum, t) => sum + t.totalMiles, 0);
    const totalPersonalMiles = trips.filter(t => t.purpose !== 'Business').reduce((sum, t) => sum + t.totalMiles, 0);
    const totalMiles = totalBusinessMiles + totalPersonalMiles;
    const businessUsePercent = totalMiles > 0 ? (totalBusinessMiles / totalMiles) : 0;

    // 3. Simplified Expenses Calculation (Mileage Allowance)
    const rate1Limit = 10000;
    const milesAtRate1 = Math.min(totalBusinessMiles, rate1Limit);
    const milesAtRate2 = Math.max(0, totalBusinessMiles - rate1Limit);
    
    const allowanceRate1 = milesAtRate1 * settings.businessRateFirst10k;
    const allowanceRate2 = milesAtRate2 * settings.businessRateAfter10k;
    const totalMileageAllowance = allowanceRate1 + allowanceRate2;

    // Helper to calculate Net Cost (excluding VAT if reclaimable)
    // Assuming standard UK VAT 20% for simplicity (Gross / 1.2)
    const getDeductibleAmount = (e: Expense) => {
       return e.isVatClaimable ? (e.amount / 1.2) : e.amount;
    };

    // 4. Expense Categorization
    // Expenses that can be claimed IN ADDITION to mileage allowance (Parking, Tolls, some 'Other')
    const allowableWithSimplified = expenses.filter(e => 
      e.category === ExpenseCategory.PARKING || 
      e.category === ExpenseCategory.OTHER // Assuming 'Other' is admin/phone etc, not car parts
    ).reduce((sum, e) => sum + getDeductibleAmount(e), 0);

    // Vehicle Running Costs (Fuel, Repairs, Ins, Tax, MOT, Cleaning) - cannot claim with Simplified
    const vehicleRunningCosts = expenses.filter(e => 
      [ExpenseCategory.FUEL, ExpenseCategory.REPAIRS, ExpenseCategory.INSURANCE, ExpenseCategory.TAX, ExpenseCategory.MOT, ExpenseCategory.CLEANING].includes(e.category)
    ).reduce((sum, e) => sum + getDeductibleAmount(e), 0);
    
    // 4.5 Manual Allowances
    const totalManualAllowances = (settings.manualAllowances || []).reduce((sum, a) => sum + a.amount, 0);

    // 5. Totals per method
    const totalDeductionSimplified = totalMileageAllowance + allowableWithSimplified + totalManualAllowances;
    
    // Actual Costs Method: (Vehicle Costs * Business %) + Specific Business Expenses
    const allowableVehicleCosts = vehicleRunningCosts * businessUsePercent;
    const totalDeductionActual = allowableVehicleCosts + allowableWithSimplified + totalManualAllowances; // Parking is 100% business usually + manual allowances

    // 6. Tax Estimation (2024/25 Rates)
    // FIX: Respect the user's setting for the "Official" calculation
    const deductionUsed = settings.claimMethod === 'SIMPLIFIED' ? totalDeductionSimplified : totalDeductionActual;
    const taxableProfit = Math.max(0, totalRevenue - deductionUsed);

    // Income Tax Bands (2024/25)
    const PERSONAL_ALLOWANCE = 12570;
    const BASIC_RATE_LIMIT = 50270;
    const HIGHER_RATE_LIMIT = 125140;

    let incomeTax = 0;
    let taxBreakdown = { basic: 0, higher: 0, additional: 0 };
    let taxableIncome = 0;

    if (taxableProfit > PERSONAL_ALLOWANCE) {
      taxableIncome = taxableProfit - PERSONAL_ALLOWANCE;

      // Basic Rate (20%)
      const basicBandWidth = BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE;
      const amountInBasic = Math.min(taxableIncome, basicBandWidth);
      taxBreakdown.basic = amountInBasic * 0.20;
      incomeTax += taxBreakdown.basic;

      // Higher Rate (40%)
      if (taxableIncome > basicBandWidth) {
        const remainingAfterBasic = taxableIncome - basicBandWidth;
        const higherBandWidth = HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT;
        const amountInHigher = Math.min(remainingAfterBasic, higherBandWidth);
        taxBreakdown.higher = amountInHigher * 0.40;
        incomeTax += taxBreakdown.higher;

        // Additional Rate (45%)
        if (remainingAfterBasic > higherBandWidth) {
           const amountInAdditional = remainingAfterBasic - higherBandWidth;
           taxBreakdown.additional = amountInAdditional * 0.45;
           incomeTax += taxBreakdown.additional;
        }
      }
    }

    // Class 4 NI (2024/25)
    // 6% between £12,570 and £50,270
    // 2% above £50,270
    let ni = 0;
    let niBreakdown = { band1: 0, band2: 0 }; // band1 = 6%, band2 = 2%

    if (taxableProfit > PERSONAL_ALLOWANCE) {
       const niBandWidth = BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE;
       const profitForNi = taxableProfit - PERSONAL_ALLOWANCE;
       
       const amountAt6 = Math.min(profitForNi, niBandWidth);
       niBreakdown.band1 = amountAt6 * 0.06;
       ni += niBreakdown.band1;

       if (profitForNi > niBandWidth) {
         const amountAt2 = profitForNi - niBandWidth;
         niBreakdown.band2 = amountAt2 * 0.02;
         ni += niBreakdown.band2;
       }
    }

    return {
      totalRevenue,
      totalBusinessMiles,
      milesAtRate1,
      milesAtRate2,
      allowanceRate1,
      allowanceRate2,
      totalMileageAllowance,
      allowableWithSimplified,
      vehicleRunningCosts,
      businessUsePercent,
      allowableVehicleCosts,
      totalManualAllowances,
      totalDeductionSimplified,
      totalDeductionActual,
      deductionUsed, // The deduction based on settings
      taxableProfit,
      taxableIncome,
      estimatedTax: incomeTax,
      taxBreakdown,
      estimatedNI: ni,
      niBreakdown,
      isSimplifiedBetter: totalDeductionSimplified > totalDeductionActual,
      isActualBetter: totalDeductionActual > totalDeductionSimplified,
      difference: Math.abs(totalDeductionSimplified - totalDeductionActual)
    };
  }, [trips, expenses, dailyLogs, settings]);

  const handleAddAllowance = () => {
    if (!newAllowance.description || !newAllowance.amount) return;
    const updatedSettings = {
      ...settings,
      manualAllowances: [
        ...(settings.manualAllowances || []),
        { id: Date.now().toString(), description: newAllowance.description, amount: parseFloat(newAllowance.amount) }
      ]
    };
    onUpdateSettings(updatedSettings);
    setNewAllowance({ description: '', amount: '' });
  };

  const handleRemoveAllowance = (id: string) => {
    const updatedSettings = {
      ...settings,
      manualAllowances: (settings.manualAllowances || []).filter(a => a.id !== id)
    };
    onUpdateSettings(updatedSettings);
  };

  const handleExportReport = () => {
    const csvRows = [
      ['Category', 'Item', 'Value', 'Notes'],
      ['REVENUE', 'Total Revenue', `£${analysis.totalRevenue.toFixed(2)}`, 'Sum of all Daily Work Logs'],
      [],
      ['SIMPLIFIED METHOD', 'Business Miles', analysis.totalBusinessMiles.toFixed(1), ''],
      ['SIMPLIFIED METHOD', 'Rate 1 Allowance (First 10k)', `£${analysis.allowanceRate1.toFixed(2)}`, `${analysis.milesAtRate1.toFixed(1)} miles @ ${settings.businessRateFirst10k * 100}p`],
      ['SIMPLIFIED METHOD', 'Rate 2 Allowance (Over 10k)', `£${analysis.allowanceRate2.toFixed(2)}`, `${analysis.milesAtRate2.toFixed(1)} miles @ ${settings.businessRateAfter10k * 100}p`],
      ['SIMPLIFIED METHOD', 'Allowable Expenses', `£${analysis.allowableWithSimplified.toFixed(2)}`, 'Parking, Tolls, etc.'],
      ['SIMPLIFIED METHOD', 'Manual Adjustments', `£${analysis.totalManualAllowances.toFixed(2)}`, 'Custom added allowances'],
      ['SIMPLIFIED METHOD', 'TOTAL DEDUCTION', `£${analysis.totalDeductionSimplified.toFixed(2)}`, ''],
      [],
      ['ACTUAL COSTS METHOD', 'Total Vehicle Running Costs (Net)', `£${analysis.vehicleRunningCosts.toFixed(2)}`, 'Fuel, Repairs, Insurance, etc. (Excl VAT if reclaimed)'],
      ['ACTUAL COSTS METHOD', 'Business Use %', `${(analysis.businessUsePercent * 100).toFixed(1)}%`, 'Business Miles / Total Miles'],
      ['ACTUAL COSTS METHOD', 'Allowable Vehicle Costs', `£${analysis.allowableVehicleCosts.toFixed(2)}`, 'Total Costs * Business %'],
      ['ACTUAL COSTS METHOD', 'Other Business Expenses', `£${analysis.allowableWithSimplified.toFixed(2)}`, 'Parking, Tolls, etc. (100% allowable)'],
      ['ACTUAL COSTS METHOD', 'Manual Adjustments', `£${analysis.totalManualAllowances.toFixed(2)}`, 'Custom added allowances'],
      ['ACTUAL COSTS METHOD', 'TOTAL DEDUCTION', `£${analysis.totalDeductionActual.toFixed(2)}`, ''],
      [],
      ['TAX ESTIMATION', 'Method Configured', settings.claimMethod === 'SIMPLIFIED' ? 'Simplified Expenses' : 'Actual Costs', 'Based on user settings'],
      ['TAX ESTIMATION', 'Taxable Profit', `£${analysis.taxableProfit.toFixed(2)}`, 'Revenue - Selected Deduction'],
      ['TAX ESTIMATION', 'Personal Allowance (2024/25)', '£12,570.00', 'Standard assumption'],
      ['TAX ESTIMATION', 'Income Tax (Basic 20%)', `£${analysis.taxBreakdown.basic.toFixed(2)}`, ''],
      ['TAX ESTIMATION', 'Income Tax (Higher 40%)', `£${analysis.taxBreakdown.higher.toFixed(2)}`, ''],
      ['TAX ESTIMATION', 'Income Tax (Additional 45%)', `£${analysis.taxBreakdown.additional.toFixed(2)}`, ''],
      ['TAX ESTIMATION', 'Class 4 NI (6% Band)', `£${analysis.niBreakdown.band1.toFixed(2)}`, ''],
      ['TAX ESTIMATION', 'Class 4 NI (2% Band)', `£${analysis.niBreakdown.band2.toFixed(2)}`, ''],
      ['TAX ESTIMATION', 'TOTAL ESTIMATED LIABILITY', `£${(analysis.estimatedTax + analysis.estimatedNI).toFixed(2)}`, 'Excludes Class 2 NI']
    ];

    const csvContent = csvRows.map(e => e.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "tax_calculation_breakdown.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentYear = new Date().getFullYear();
  const taxYearLabel = new Date().getMonth() > 3 
    ? `${currentYear}/${(currentYear + 1).toString().slice(2)}`
    : `${currentYear - 1}/${currentYear.toString().slice(2)}`;

  return (
    <div className="space-y-6">
      
      {/* Header / Intro */}
      <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Scale size={200} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-6">
           <div className="max-w-2xl">
             <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
               <BookOpen className="text-blue-400" /> HMRC Logic Breakdown
             </h2>
             <p className="text-slate-300 text-lg leading-relaxed">
               You have selected the <span className="text-white font-bold">{settings.claimMethod === 'SIMPLIFIED' ? 'Simplified Expenses' : 'Actual Costs'}</span> method in settings. 
               We calculate your potential tax bill based on this choice, but compare it below to see if you could save money switching.
             </p>
           </div>
           <button 
             onClick={handleExportReport}
             className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl transition-all font-bold backdrop-blur-sm border border-white/20 shadow-lg"
           >
              <Download size={20} />
              <span>Export Report</span>
           </button>
        </div>
      </div>

      {/* Manual Allowances / Adjustments Section */}
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
        <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
           <div>
             <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                <BadgeCheck className="text-indigo-600" />
                Additional Allowances & Adjustments
             </h3>
             <p className="text-indigo-600/80 text-xs">Add fixed costs like "Use of Home as Office" or "Specialist Clothing". These are added to your deduction.</p>
           </div>
           <div className="flex gap-2 w-full md:w-auto">
             <input 
               type="text" 
               placeholder="Description (e.g. Uniform)" 
               value={newAllowance.description}
               onChange={e => setNewAllowance({...newAllowance, description: e.target.value})}
               className="p-2 border border-indigo-200 rounded-lg text-sm w-full md:w-48 focus:ring-2 focus:ring-indigo-500 outline-none"
             />
             <input 
               type="number" 
               placeholder="£ Amount" 
               value={newAllowance.amount}
               onChange={e => setNewAllowance({...newAllowance, amount: e.target.value})}
               className="p-2 border border-indigo-200 rounded-lg text-sm w-24 focus:ring-2 focus:ring-indigo-500 outline-none"
             />
             <button 
               onClick={handleAddAllowance}
               className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors flex items-center gap-1"
             >
               <Plus size={18} /> <span className="hidden md:inline text-sm font-bold">Add</span>
             </button>
           </div>
        </div>
        {settings.manualAllowances && settings.manualAllowances.length > 0 && (
           <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white">
              {settings.manualAllowances.map(allowance => (
                <div key={allowance.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:border-indigo-100 hover:bg-indigo-50/50 transition-colors group">
                   <span className="text-sm font-bold text-slate-700">{allowance.description}</span>
                   <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-indigo-600">£{allowance.amount.toFixed(2)}</span>
                      <button onClick={() => handleRemoveAllowance(allowance.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                         <Trash2 size={16} />
                      </button>
                   </div>
                </div>
              ))}
           </div>
        )}
      </div>

      {/* Comparison Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Simplified Expenses Card */}
        <div className={`p-6 rounded-2xl border-2 transition-all relative overflow-hidden ${settings.claimMethod === 'SIMPLIFIED' ? 'bg-blue-50 border-blue-500 ring-4 ring-blue-500/10' : 'bg-white border-slate-200'}`}>
           {settings.claimMethod === 'SIMPLIFIED' && (
             <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">ACTIVE</div>
           )}
           <div className="flex justify-between items-start mb-4">
             <h3 className={`font-bold ${settings.claimMethod === 'SIMPLIFIED' ? 'text-blue-800' : 'text-slate-700'}`}>Simplified Expenses</h3>
             {analysis.isSimplifiedBetter && (
                <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full">
                  <BadgeCheck size={12} /> BEST VALUE
                </span>
             )}
           </div>
           <p className="text-3xl font-black text-slate-800">£{analysis.totalDeductionSimplified.toFixed(2)}</p>
           <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-wider">Total Deduction</p>
        </div>

        {/* Actual Costs Card */}
        <div className={`p-6 rounded-2xl border-2 transition-all relative overflow-hidden ${settings.claimMethod === 'ACTUAL' ? 'bg-blue-50 border-blue-500 ring-4 ring-blue-500/10' : 'bg-white border-slate-200'}`}>
           {settings.claimMethod === 'ACTUAL' && (
             <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">ACTIVE</div>
           )}
           <div className="flex justify-between items-start mb-4">
             <h3 className={`font-bold ${settings.claimMethod === 'ACTUAL' ? 'text-blue-800' : 'text-slate-700'}`}>Actual Costs</h3>
             {analysis.isActualBetter && (
                <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full">
                  <BadgeCheck size={12} /> BEST VALUE
                </span>
             )}
           </div>
           <p className="text-3xl font-black text-slate-800">£{analysis.totalDeductionActual.toFixed(2)}</p>
           <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-wider">Total Deduction</p>
        </div>

        {/* Comparison Result */}
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white p-6 rounded-2xl shadow-lg border border-indigo-500 flex flex-col justify-center">
           <h3 className="font-bold text-indigo-100 mb-2">Recommendation</h3>
           {analysis.isSimplifiedBetter && settings.claimMethod === 'SIMPLIFIED' && (
             <div>
                <p className="text-lg font-bold">You are using the best method.</p>
                <p className="text-xs text-indigo-200 mt-1">Simplified expenses gives you the highest deduction.</p>
             </div>
           )}
           {analysis.isActualBetter && settings.claimMethod === 'ACTUAL' && (
             <div>
                <p className="text-lg font-bold">You are using the best method.</p>
                <p className="text-xs text-indigo-200 mt-1">Actual costs gives you the highest deduction.</p>
             </div>
           )}
           {analysis.isSimplifiedBetter && settings.claimMethod === 'ACTUAL' && (
             <div>
                <p className="text-lg font-bold text-yellow-300">Switch to Simplified!</p>
                <p className="text-sm mt-1">You could deduct an extra <span className="font-black">£{analysis.difference.toFixed(2)}</span>.</p>
             </div>
           )}
           {analysis.isActualBetter && settings.claimMethod === 'SIMPLIFIED' && (
             <div>
                <p className="text-lg font-bold text-yellow-300">Switch to Actual!</p>
                <p className="text-sm mt-1">You could deduct an extra <span className="font-black">£{analysis.difference.toFixed(2)}</span>.</p>
             </div>
           )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-fit">
        <button 
          onClick={() => setActiveTab('comparison')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'comparison' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Overview & Tax Bill
        </button>
        <button 
          onClick={() => setActiveTab('simplified')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'simplified' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Method A: Simplified
        </button>
        <button 
          onClick={() => setActiveTab('actual')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'actual' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Method B: Actual Costs
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* SIMPLIFIED VIEW */}
        {activeTab === 'simplified' && (
          <div className="p-8 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Calculator className="text-blue-500" /> Calculation Breakdown
            </h3>
            
            <div className="space-y-4">
               {/* Step 1 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">01</div>
                   <div>
                     <p className="font-bold text-slate-700">First 10,000 Business Miles</p>
                     <p className="text-xs text-slate-400">Claimed at {settings.businessRateFirst10k * 100}p per mile</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-sm text-slate-500">{analysis.milesAtRate1.toFixed(1)} miles</p>
                    <p className="text-lg font-bold text-slate-800">£{analysis.allowanceRate1.toFixed(2)}</p>
                 </div>
               </div>

               {/* Step 2 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">02</div>
                   <div>
                     <p className="font-bold text-slate-700">Remaining Business Miles</p>
                     <p className="text-xs text-slate-400">Claimed at {settings.businessRateAfter10k * 100}p per mile</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-sm text-slate-500">{analysis.milesAtRate2.toFixed(1)} miles</p>
                    <p className="text-lg font-bold text-slate-800">£{analysis.allowanceRate2.toFixed(2)}</p>
                 </div>
               </div>

               {/* Step 3 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">03</div>
                   <div>
                     <p className="font-bold text-slate-700">Allowable Other Expenses</p>
                     <p className="text-xs text-slate-400">Parking, Tolls, Admin Costs (No Fuel/Repairs)</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">£{analysis.allowableWithSimplified.toFixed(2)}</p>
                 </div>
               </div>

               {/* Step 3.5 Manual */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">04</div>
                   <div>
                     <p className="font-bold text-slate-700">Manual Allowances</p>
                     <p className="text-xs text-slate-400">Added Adjustments</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">£{analysis.totalManualAllowances.toFixed(2)}</p>
                 </div>
               </div>

               <div className="border-t-2 border-dashed border-slate-200 my-4" />

               <div className="flex justify-between items-center">
                 <span className="font-bold text-xl text-slate-800">Total Allowance</span>
                 <span className="font-black text-2xl text-blue-600">£{analysis.totalDeductionSimplified.toFixed(2)}</span>
               </div>
            </div>

            <div className="mt-8 bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
              <Info className="text-blue-600 shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-bold mb-1">HMRC Rules:</p>
                <p>If you use simplified expenses, you <strong>cannot</strong> claim for vehicle insurance, road tax, fuel, electricity, MOT, or repairs. These are covered by the mileage rate.</p>
              </div>
            </div>
          </div>
        )}

        {/* ACTUAL COSTS VIEW */}
        {activeTab === 'actual' && (
          <div className="p-8 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Calculator className="text-orange-500" /> Calculation Breakdown
            </h3>

             <div className="space-y-4">
               {/* Step 1 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">01</div>
                   <div>
                     <p className="font-bold text-slate-700">Total Vehicle Running Costs (Net)</p>
                     <p className="text-xs text-slate-400">Fuel, Insurance, Repairs, Tax, MOT, Cleaning (Excl. VAT)</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">£{analysis.vehicleRunningCosts.toFixed(2)}</p>
                 </div>
               </div>

               {/* Step 2 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">02</div>
                   <div>
                     <p className="font-bold text-slate-700">Business Use Proportion</p>
                     <p className="text-xs text-slate-400">{analysis.totalBusinessMiles.toFixed(1)} business miles / {analysis.totalBusinessMiles + analysis.totalPersonalMiles} total miles</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-orange-600">{(analysis.businessUsePercent * 100).toFixed(1)}%</p>
                 </div>
               </div>

               {/* Step 3 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">03</div>
                   <div>
                     <p className="font-bold text-slate-700">Allowable Vehicle Deduction</p>
                     <p className="text-xs text-slate-400">Total Net Costs × Business %</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">£{analysis.allowableVehicleCosts.toFixed(2)}</p>
                 </div>
               </div>

               {/* Step 4 */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">04</div>
                   <div>
                     <p className="font-bold text-slate-700">Other Business Expenses</p>
                     <p className="text-xs text-slate-400">Parking, Tolls (100% Allowable)</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">£{analysis.allowableWithSimplified.toFixed(2)}</p>
                 </div>
               </div>

               {/* Step 4.5 Manual */}
               <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="flex items-center gap-4">
                   <div className="bg-white p-2 rounded-lg text-slate-500 font-mono text-sm border border-slate-200">05</div>
                   <div>
                     <p className="font-bold text-slate-700">Manual Allowances</p>
                     <p className="text-xs text-slate-400">Added Adjustments</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">£{analysis.totalManualAllowances.toFixed(2)}</p>
                 </div>
               </div>

               <div className="border-t-2 border-dashed border-slate-200 my-4" />

               <div className="flex justify-between items-center">
                 <span className="font-bold text-xl text-slate-800">Total Deduction</span>
                 <span className="font-black text-2xl text-orange-600">£{analysis.totalDeductionActual.toFixed(2)}</span>
               </div>
            </div>

            <div className="mt-8 bg-orange-50 p-4 rounded-xl border border-orange-100 flex gap-3">
              <AlertTriangle className="text-orange-600 shrink-0" />
              <div className="text-sm text-orange-800">
                <p className="font-bold mb-1">Important:</p>
                <p>You must keep detailed logs of <strong>every</strong> mile (business and personal) to prove the business percentage accurately to HMRC. Capital Allowances for the vehicle purchase are calculated separately and can be complex.</p>
              </div>
            </div>
          </div>
        )}

        {/* COMPARISON & TAX VIEW */}
        {activeTab === 'comparison' && (
           <div className="p-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                
                {/* Profit Loss View */}
                <div>
                   <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <TrendingUp className="text-emerald-500" /> Taxable Profit
                   </h3>
                   <div className="bg-slate-50 p-6 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-slate-600">Total Revenue (Work Logs)</span>
                        <span className="font-bold text-slate-800">£{analysis.totalRevenue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-slate-600">Less: Allowable Deduction ({settings.claimMethod === 'SIMPLIFIED' ? 'Simplified' : 'Actual'})</span>
                        <span className="font-bold text-red-500">- £{analysis.deductionUsed.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                        <span className="font-black text-slate-800 text-lg">Net Profit</span>
                        <span className="font-black text-emerald-600 text-xl">£{analysis.taxableProfit.toFixed(2)}</span>
                      </div>
                   </div>
                </div>

                {/* Estimated Bill Calculator */}
                <div>
                   <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <PoundSterling className="text-purple-500" /> Tax Calculator (2024/25)
                   </h3>
                   <div className="bg-purple-50 p-6 rounded-2xl space-y-3 border border-purple-100">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-purple-900">Taxable Profit</span>
                        <span className="font-bold text-purple-900">£{analysis.taxableProfit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-purple-900">Personal Allowance</span>
                        <span className="font-bold text-purple-900 text-red-500">- £12,570.00</span>
                      </div>
                      
                      <div className="border-t border-purple-200 my-2" />
                      
                      <button 
                        onClick={() => setShowTaxBreakdown(!showTaxBreakdown)} 
                        className="w-full flex items-center justify-between text-left text-xs font-bold text-purple-700 bg-purple-100 p-2 rounded-lg hover:bg-purple-200 transition-colors"
                      >
                         <span>View Tax & NI Breakdown</span>
                         {showTaxBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {showTaxBreakdown && (
                        <div className="bg-white/50 p-3 rounded-lg space-y-2 animate-in slide-in-from-top-2 text-xs">
                           <div className="flex justify-between">
                              <span className="text-slate-600">Basic Rate (20%)</span>
                              <span className="font-mono">£{analysis.taxBreakdown.basic.toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between">
                              <span className="text-slate-600">Higher Rate (40%)</span>
                              <span className="font-mono">£{analysis.taxBreakdown.higher.toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between">
                              <span className="text-slate-600">Additional Rate (45%)</span>
                              <span className="font-mono">£{analysis.taxBreakdown.additional.toFixed(2)}</span>
                           </div>
                           <div className="border-t border-purple-100 my-1" />
                           <div className="flex justify-between">
                              <span className="text-slate-600">Class 4 NI (6%)</span>
                              <span className="font-mono">£{analysis.niBreakdown.band1.toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between">
                              <span className="text-slate-600">Class 4 NI (2%)</span>
                              <span className="font-mono">£{analysis.niBreakdown.band2.toFixed(2)}</span>
                           </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-sm pt-2">
                        <span className="font-medium text-purple-800">Total Income Tax</span>
                        <span className="font-bold text-purple-800">£{analysis.estimatedTax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-medium text-purple-800">Total Class 4 NI</span>
                        <span className="font-bold text-purple-800">£{analysis.estimatedNI.toFixed(2)}</span>
                      </div>
                      <div className="border-t-2 border-dashed border-purple-300 pt-3 flex justify-between items-center">
                        <span className="font-black text-purple-900 text-lg">Total Estimated Liability</span>
                        <span className="font-black text-purple-700 text-xl">£{(analysis.estimatedTax + analysis.estimatedNI).toFixed(2)}</span>
                      </div>
                   </div>
                   <p className="text-[10px] text-slate-400 mt-2 text-center">
                     *Calculations use 2024/25 UK bands. Does not include Class 2 NI (voluntary) or Student Loans.
                   </p>
                </div>
              </div>

              {/* Reference Section - New Addition */}
              <div className="mt-10 pt-10 border-t border-slate-200">
                 <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Info className="text-blue-500" /> Reference: {taxYearLabel} Tax Year Thresholds
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {/* Income Tax Table */}
                   <div>
                     <h4 className="font-bold text-slate-600 mb-2 uppercase text-xs tracking-wider">Income Tax Bands</h4>
                     <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-sm">
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100 bg-slate-50 font-medium text-slate-500">
                          <span>Band</span>
                          <span className="text-right">Taxable Income</span>
                       </div>
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400"></div> Personal Allowance</span>
                          <span className="text-right">Up to £12,570</span>
                       </div>
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400"></div> Basic Rate (20%)</span>
                          <span className="text-right">£12,571 - £50,270</span>
                       </div>
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-400"></div> Higher Rate (40%)</span>
                          <span className="text-right">£50,271 - £125,140</span>
                       </div>
                       <div className="grid grid-cols-2 p-3">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-pink-400"></div> Additional Rate (45%)</span>
                          <span className="text-right">Over £125,140</span>
                       </div>
                     </div>
                   </div>

                   {/* NI Table */}
                   <div>
                     <h4 className="font-bold text-slate-600 mb-2 uppercase text-xs tracking-wider">Class 4 National Insurance</h4>
                     <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-sm">
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100 bg-slate-50 font-medium text-slate-500">
                          <span>Band</span>
                          <span className="text-right">Profits</span>
                       </div>
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-300"></div> Small Profits Threshold</span>
                          <span className="text-right">Up to £12,570</span>
                       </div>
                       <div className="grid grid-cols-2 p-3 border-b border-slate-100">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-400"></div> Main Rate (6%)</span>
                          <span className="text-right">£12,571 - £50,270</span>
                       </div>
                       <div className="grid grid-cols-2 p-3">
                          <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-400"></div> Upper Rate (2%)</span>
                          <span className="text-right">Over £50,270</span>
                       </div>
                     </div>
                     <p className="text-[10px] text-slate-400 mt-2">
                       *Class 2 NI is now voluntary for most self-employed people with profits over £6,725 but is treated as paid if profits are over £12,570.
                     </p>
                   </div>
                 </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};