import React, { useState, useMemo } from 'react';
import { DailyWorkLog, Trip, Expense, Settings, DriverRole } from '../types';
import { DatePicker } from './DatePicker';
import { Plus, Clock, PoundSterling, Fuel, TrendingUp, Trash2, Search, Info, BarChart3, ChevronUp, Briefcase, Navigation, PiggyBank, Wrench, CreditCard, Package, Car } from 'lucide-react';

interface WorkLogProps {
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
  onAddLog: (log: DailyWorkLog) => void;
  onDeleteLog: (id: string) => void;
}

const getProvidersByRole = (role: DriverRole) => {
  switch (role) {
    case 'COURIER':
      return ['Amazon Flex', 'DPD', 'Evri', 'Yodel', 'CitySprint', 'Royal Mail', 'Gophr'];
    case 'FOOD_DELIVERY':
      return ['Uber Eats', 'Deliveroo', 'Just Eat', 'Stuart', 'Beelivery', 'Gopuff'];
    case 'TAXI':
      return ['Uber', 'Bolt', 'FREENOW', 'Ola', 'Gett', 'Local Firm', 'Private Clients'];
    case 'LOGISTICS':
      return ['BCA Logistics', 'Engineius', 'Manheim', 'Drascombe', 'Auto Trader', 'Private Trade'];
    default:
      return ['Amazon', 'Uber', 'Courier', 'Private Client', 'Agency'];
  }
};

const getJobLabel = (roles: DriverRole[]) => {
  if (!roles || roles.length === 0) return 'Jobs';
  
  const labels = new Set<string>();
  if (roles.includes('COURIER')) labels.add('Drops');
  if (roles.includes('FOOD_DELIVERY')) labels.add('Deliveries');
  if (roles.includes('TAXI')) labels.add('Rides');
  if (roles.includes('LOGISTICS')) labels.add('Movements');
  
  const arr = Array.from(labels);
  if (arr.length === 0) return 'Jobs';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} / ${arr[1]}`;
  return 'Jobs / Tasks';
};

export const WorkLog: React.FC<WorkLogProps> = ({ logs, trips, expenses, settings, onAddLog, onDeleteLog }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [provider, setProvider] = useState<string>('');
  const [customProvider, setCustomProvider] = useState<string>('');
  const [revenue, setRevenue] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [fuel, setFuel] = useState<string>('');
  const [jobCount, setJobCount] = useState<string>('');

  // Combine providers from all selected roles
  const providers = useMemo(() => {
    const roles = settings.driverRoles || ['COURIER'];
    const allProviders = roles.flatMap(role => getProvidersByRole(role));
    return Array.from(new Set(allProviders)).sort();
  }, [settings.driverRoles]);

  const jobLabel = getJobLabel(settings.driverRoles || ['COURIER']);

  // Automatically calculate metrics for the selected date
  const dayStats = useMemo(() => {
    const dayTrips = trips.filter(t => t.date === selectedDate);
    const dayExpenses = expenses.filter(e => e.date === selectedDate);
    
    return {
      miles: dayTrips.reduce((sum, t) => sum + t.totalMiles, 0),
      expenseTotal: dayExpenses.reduce((sum, e) => sum + e.amount, 0),
      count: dayTrips.length
    };
  }, [selectedDate, trips, expenses]);

  const calculateMPG = (miles: number, liters: number) => {
    if (!liters || liters === 0 || miles === 0) return 0;
    // UK Gallon = 4.54609 Liters
    return (miles / liters) * 4.54609;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalProvider = provider === 'Other' ? customProvider : provider;
    if (!revenue || !hours || !finalProvider) return;

    onAddLog({
      id: Date.now().toString(),
      date: selectedDate,
      provider: finalProvider,
      revenue: parseFloat(revenue),
      hoursWorked: parseFloat(hours),
      fuelLiters: fuel ? parseFloat(fuel) : undefined,
      jobCount: jobCount ? parseInt(jobCount) : undefined
    });

    setRevenue('');
    setHours('');
    setFuel('');
    setJobCount('');
    setProvider('');
    setCustomProvider('');
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-slate-800">Daily Performance</h3>
        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-indigo-600 text-white px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all active:scale-95"
        >
          {isFormOpen ? <ChevronUp size={18} /> : <Plus size={18} />}
          Log Shift Earnings
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-100 animate-slide-down relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DatePicker label="Date" value={selectedDate} onChange={setSelectedDate} />
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Source: Mileage & Expense Tabs</p>
                <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <Navigation size={14} className="text-blue-500" />
                     <span className="text-sm font-bold text-slate-700">{dayStats.miles.toFixed(1)} Daily Miles</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <PoundSterling size={14} className="text-emerald-500" />
                     <span className="text-sm font-bold text-slate-700">£{dayStats.expenseTotal.toFixed(2)} Costs</span>
                   </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Work Provider</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select
                    required
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium bg-white"
                  >
                    <option value="">Select Provider</option>
                    {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    <option value="Other">Other (Type below)</option>
                  </select>
                </div>
              </div>
              
              {provider === 'Other' && (
                <div className="animate-in fade-in slide-in-from-left-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Provider Name</label>
                  <input
                    type="text"
                    required
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Local Courier"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Revenue (£)</label>
                <div className="relative">
                  <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value)}
                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Hours Worked</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    placeholder="8.5"
                  />
                </div>
              </div>

               <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{jobLabel}</label>
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="number"
                    step="1"
                    value={jobCount}
                    onChange={(e) => setJobCount(e.target.value)}
                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Fuel Used (Liters)</label>
                <div className="relative">
                  <Fuel className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="number"
                    step="0.01"
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value)}
                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    placeholder="For MPG"
                  />
                </div>
              </div>
            </div>

            {fuel && parseFloat(fuel) > 0 && dayStats.miles > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="text-emerald-600" size={18} />
                  <span className="text-sm font-bold text-emerald-800">Estimated Fuel Economy</span>
                </div>
                <span className="text-lg font-black text-emerald-700">{calculateMPG(dayStats.miles, parseFloat(fuel)).toFixed(1)} <span className="text-xs font-medium">MPG (UK)</span></span>
              </div>
            )}

            <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 transition-all transform active:scale-[0.98]">
              Save Performance Record
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {logs.sort((a,b) => b.date.localeCompare(a.date)).map(log => {
          const matchingTrips = trips.filter(t => t.date === log.date);
          const miles = matchingTrips.reduce((sum, t) => sum + t.totalMiles, 0);
          const hourlyRate = log.revenue / log.hoursWorked;
          const mpg = log.fuelLiters ? calculateMPG(miles, log.fuelLiters) : 0;

          // Smart Allocation Calcs
          const taxAmt = log.revenue * (settings.taxSetAsidePercent / 100);
          const maintAmt = log.revenue * (settings.maintenanceSetAsidePercent / 100);
          const debtAmt = log.revenue * (settings.debtSetAsidePercent / 100);
          const netProfit = log.revenue - taxAmt - maintAmt - debtAmt;

          return (
            <div key={log.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={() => onDeleteLog(log.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
               </div>
               
               <div className="flex justify-between items-start mb-4">
                 <div>
                   <div className="flex items-center gap-2 mb-1">
                     <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest">{log.date}</span>
                     <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full uppercase">{log.provider}</span>
                   </div>
                   <h4 className="text-xl font-bold text-slate-800">£{log.revenue.toFixed(2)}</h4>
                 </div>
                 <div className="text-right">
                   <p className="text-sm font-bold text-slate-700">{log.hoursWorked}h Shift</p>
                   <p className="text-xs text-slate-500">£{hourlyRate.toFixed(2)}/hr</p>
                 </div>
               </div>

               {/* Smart Allocations Section */}
               <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-2 flex items-center gap-1"><PiggyBank size={10} /> Smart Allocations</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-orange-600 font-medium">Tax ({settings.taxSetAsidePercent}%)</span>
                       <span className="font-bold text-slate-700">£{taxAmt.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                       <span className="text-blue-600 font-medium">Maint ({settings.maintenanceSetAsidePercent}%)</span>
                       <span className="font-bold text-slate-700">£{maintAmt.toFixed(2)}</span>
                    </div>
                    {settings.debtSetAsidePercent > 0 && (
                      <div className="flex justify-between items-center text-xs">
                         <span className="text-purple-600 font-medium">Debt ({settings.debtSetAsidePercent}%)</span>
                         <span className="font-bold text-slate-700">£{debtAmt.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-1 mt-1 col-span-2">
                       <span className="text-emerald-600 font-bold uppercase">Net Pocket</span>
                       <span className="font-black text-emerald-700">£{netProfit.toFixed(2)}</span>
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                 <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Efficiency</p>
                    <div className="flex items-center gap-2">
                       <TrendingUp size={14} className="text-indigo-400" />
                       <span className="text-sm font-bold text-slate-700">£{(log.revenue / (miles || 1)).toFixed(2)}/mi</span>
                    </div>
                 </div>
                 {log.jobCount && (
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Volume</p>
                      <div className="flex items-center gap-2">
                         <Package size={14} className="text-blue-400" />
                         <span className="text-sm font-bold text-slate-700">{log.jobCount} {jobLabel.split(' / ')[0]}</span>
                      </div>
                   </div>
                 )}
                 <div className="bg-white/50 p-0 rounded-xl">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                      <Fuel size={10} /> Fuel Economy
                    </p>
                    <div className="flex flex-col">
                       {mpg > 0 ? (
                         <>
                           <span className="text-lg font-black text-emerald-600 leading-none">{mpg.toFixed(1)} <span className="text-[10px] font-bold uppercase">MPG</span></span>
                         </>
                       ) : (
                         <span className="text-xs font-bold text-slate-400 italic">--</span>
                       )}
                    </div>
                 </div>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};