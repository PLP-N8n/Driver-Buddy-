import React, { useMemo, useState } from 'react';
import { Trip, Expense, Settings, DailyWorkLog } from '../types';
import { DatePicker } from './DatePicker';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { TrendingUp, Wallet, Receipt, AlertCircle, Bell, Calendar, AlertTriangle, ArrowRight, CheckCircle, Car, Coins, User, Clock, Fuel, BarChart3, Briefcase, Filter, X, Gauge } from 'lucide-react';

interface DashboardProps {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  onNavigate: (tab: any) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export const Dashboard: React.FC<DashboardProps> = ({ trips, expenses, dailyLogs, settings, onUpdateSettings, onNavigate }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const stats = useMemo(() => {
    // Filter logic
    const start = startDate ? new Date(startDate) : new Date('1970-01-01');
    const end = endDate ? new Date(endDate) : new Date('2999-12-31');
    // Set end date to end of day to include entries on that day
    end.setHours(23, 59, 59, 999);

    const isInRange = (dateStr: string) => {
      const d = new Date(dateStr);
      return d >= start && d <= end;
    };

    const filteredTrips = trips.filter(t => isInRange(t.date));
    const filteredExpenses = expenses.filter(e => isInRange(e.date));
    const filteredLogs = dailyLogs.filter(l => isInRange(l.date));

    // Calculate stats based on filtered data
    const businessTrips = filteredTrips.filter(t => t.purpose === 'Business');
    const totalBusinessMiles = businessTrips.reduce((sum, t) => sum + t.totalMiles, 0);
    const totalPersonalMiles = filteredTrips.filter(t => t.purpose !== 'Business').reduce((sum, t) => sum + t.totalMiles, 0);
    
    // Odometer Logic (All Time based on Financial Start)
    const tripsSinceFYStart = trips.filter(t => t.date >= settings.financialYearStartDate);
    const milesSinceFYStart = tripsSinceFYStart.reduce((sum, t) => sum + t.totalMiles, 0);
    const estimatedOdometer = (settings.financialYearStartOdometer || 0) + milesSinceFYStart;
    
    // Check Date Logic
    const lastCheck = new Date(settings.lastOdometerCheckDate);
    const nextCheck = new Date(lastCheck);
    nextCheck.setMonth(nextCheck.getMonth() + 3);
    const daysUntilCheck = Math.ceil((nextCheck.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const isCheckOverdue = daysUntilCheck < 0;

    // Performance stats
    const totalRevenue = filteredLogs.reduce((sum, l) => sum + l.revenue, 0);
    const totalHours = filteredLogs.reduce((sum, l) => sum + l.hoursWorked, 0);
    const totalFuelLiters = filteredLogs.reduce((sum, l) => sum + (l.fuelLiters || 0), 0);
    const daysActive = new Set(filteredLogs.map(l => l.date)).size;
    
    const avgHourly = totalHours > 0 ? totalRevenue / totalHours : 0;
    const avgPerMile = totalBusinessMiles > 0 ? totalRevenue / totalBusinessMiles : 0;
    const overallMPG = (totalFuelLiters > 0 && totalBusinessMiles > 0) ? (totalBusinessMiles / totalFuelLiters) * 4.54609 : 0;
    const avgDailyRevenue = daysActive > 0 ? totalRevenue / daysActive : 0;

    let taxDeduction = 0;
    if (settings.claimMethod === 'SIMPLIFIED') {
      const rate1 = Number(settings.businessRateFirst10k);
      const rate2 = Number(settings.businessRateAfter10k);
      const miles = Number(totalBusinessMiles);
      
      taxDeduction = miles <= 10000 
        ? miles * rate1 
        : (10000 * rate1) + ((miles - 10000) * rate2);
    } else {
      const totalVehicleCosts = filteredExpenses.reduce((sum, e) => sum + e.amount, 0) + (settings.vehicleTax || 0);
      const businessRatio = (totalBusinessMiles + totalPersonalMiles) > 0 ? totalBusinessMiles / (totalBusinessMiles + totalPersonalMiles) : 0;
      taxDeduction = totalVehicleCosts * businessRatio;
    }

    // Provider breakdown
    const providerMap = filteredLogs.reduce((acc, log) => {
      acc[log.provider] = (acc[log.provider] || 0) + log.revenue;
      return acc;
    }, {} as Record<string, number>);

    const providerData = Object.entries(providerMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => Number(b.value) - Number(a.value));

    const topProvider = providerData.length > 0 ? providerData[0].name : 'N/A';

    return {
      totalBusinessMiles,
      totalPersonalMiles,
      taxDeduction,
      totalExpenses: filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
      avgHourly,
      avgPerMile,
      overallMPG,
      avgDailyRevenue,
      daysActive,
      providerData,
      topProvider,
      estimatedOdometer,
      daysUntilCheck,
      isCheckOverdue
    };
  }, [trips, expenses, dailyLogs, settings, startDate, endDate]);

  const handleConfirmOdometer = () => {
    onUpdateSettings({
      ...settings,
      lastOdometerCheckDate: new Date().toISOString().split('T')[0]
    });
  };

  return (
    <div className="space-y-8">
      
      {/* Date Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 text-slate-600 font-bold text-sm uppercase tracking-wide shrink-0">
          <Filter size={18} className="text-blue-500" />
          <span>Filter Period</span>
        </div>
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          <div className="flex-1">
            <DatePicker value={startDate} onChange={setStartDate} label="Start Date" />
          </div>
          <span className="text-slate-300 font-bold mt-4">to</span>
          <div className="flex-1">
             <DatePicker value={endDate} onChange={setEndDate} label="End Date" />
          </div>
        </div>
        {(startDate || endDate) && (
          <button 
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors md:mt-4"
            title="Clear Filters"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Car size={24} /></div>
            <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">Mileage</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.totalBusinessMiles.toFixed(1)}</h3>
          <p className="text-sm font-medium text-slate-500">Business Miles</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl"><Calendar size={24} /></div>
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg">Activity</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-800 mb-1">{stats.daysActive}</h3>
          <p className="text-sm font-medium text-slate-500">Days Active</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl"><Wallet size={24} /></div>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">Tax Relief</span>
          </div>
          <h3 className="text-3xl font-bold text-emerald-700 mb-1">£{stats.taxDeduction.toFixed(2)}</h3>
          <p className="text-sm font-medium text-slate-500">Estimated Deduction</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-xl"><Receipt size={24} /></div>
            <span className="text-xs font-bold bg-orange-50 text-orange-700 px-2 py-1 rounded-lg">Expenses</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-800 mb-1">£{stats.totalExpenses.toFixed(2)}</h3>
          <p className="text-sm font-medium text-slate-500">Total Costs Logged</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compliance / Odometer Card (NEW) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden">
           <div className="absolute top-0 right-0 p-6 opacity-5"><Gauge size={140} /></div>
           <div>
             <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2"><Gauge size={16} /> Fleet Compliance</h4>
             
             <div className="mb-6">
               <p className="text-xs font-bold text-slate-400 mb-1">Estimated Live Odometer</p>
               <p className="text-3xl font-black text-slate-800 tracking-tight font-mono">{Math.floor(stats.estimatedOdometer).toLocaleString()} <span className="text-sm text-slate-400 font-normal">mi</span></p>
             </div>

             <div className={`p-4 rounded-xl border ${stats.isCheckOverdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-start gap-3">
                   {stats.isCheckOverdue ? <AlertCircle className="text-red-500 shrink-0" size={20} /> : <CheckCircle className="text-emerald-500 shrink-0" size={20} />}
                   <div>
                      <p className={`text-sm font-bold ${stats.isCheckOverdue ? 'text-red-700' : 'text-slate-700'}`}>
                        {stats.isCheckOverdue ? 'Quarterly Check Overdue' : 'Odometer Check Valid'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Next physical verification due in {stats.isCheckOverdue ? '0' : stats.daysUntilCheck} days.
                      </p>
                      {stats.isCheckOverdue && (
                        <button onClick={handleConfirmOdometer} className="mt-3 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors">
                          Confirm Reading Now
                        </button>
                      )}
                      {!stats.isCheckOverdue && (
                        <button onClick={handleConfirmOdometer} className="mt-3 text-xs bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-bold transition-colors">
                           Reset Interval
                        </button>
                      )}
                   </div>
                </div>
             </div>
           </div>
        </div>

        {/* Profitability Metrics Card */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-indigo-50 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 text-indigo-100 pointer-events-none"><TrendingUp size={120} strokeWidth={1} /></div>
          <div className="relative">
            <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <BarChart3 className="text-indigo-600" size={20} />
              Profitability Metrics
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="flex items-center gap-4">
                 <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Clock size={24} /></div>
                 <div>
                    <p className="text-2xl font-black text-slate-800">£{stats.avgHourly.toFixed(2)}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Avg Hourly Rate</p>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="bg-purple-50 p-3 rounded-2xl text-purple-600"><Calendar size={24} /></div>
                 <div>
                    <p className="text-2xl font-black text-slate-800">£{stats.avgDailyRevenue.toFixed(2)}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Avg Daily Revenue</p>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600"><Fuel size={24} /></div>
                 <div>
                    <p className="text-2xl font-black text-slate-800">{stats.overallMPG > 0 ? stats.overallMPG.toFixed(1) : '--'}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vehicle MPG (UK)</p>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="bg-blue-50 p-3 rounded-2xl text-blue-600"><Briefcase size={24} /></div>
                 <div>
                    <p className="text-2xl font-black text-slate-800">{stats.topProvider}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Top Income Source</p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        
      {/* Revenue by Provider Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Earnings by Provider</h4>
          <div className="flex-1 min-h-[250px] relative">
            {stats.providerData.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
                <Briefcase size={40} className="mb-2 opacity-20" />
                <p className="text-xs font-medium">No revenue data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.providerData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.providerData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `£${value.toFixed(2)}`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {stats.providerData.length > 0 && (
            <div className="mt-4 space-y-1">
              {stats.providerData.slice(0, 3).map((provider, i) => (
                <div key={provider.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-medium text-slate-600">{provider.name}</span>
                  </div>
                  <span className="font-bold text-slate-800">£{provider.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};