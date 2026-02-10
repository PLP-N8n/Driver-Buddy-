import React, { useState, useEffect, useRef } from 'react';
import { Trip, Expense, DailyWorkLog, Settings, DEFAULT_SETTINGS, PlayerStats, DriverRole } from './types';
import { Dashboard } from './components/Dashboard';
import { MileageLog } from './components/MileageLog';
import { ExpenseLog } from './components/ExpenseLog';
import { WorkLog } from './components/WorkLog';
import { TaxLogic } from './components/TaxLogic';
import { TaxAssistant } from './components/TaxAssistant';
import { ArcadeMode } from './components/ArcadeMode';
import { LiveTracker } from './components/LiveTracker';
import { BackupRestore } from './components/BackupRestore';
import { LayoutDashboard, Car, Receipt, Settings as SettingsIcon, Download, AlertCircle, X, ShieldCheck, Bell, Clock, TrendingUp, PiggyBank, Wrench, CreditCard, Zap, Gauge, Scale, CheckCircle, AlertTriangle, Navigation, Package, Utensils, User, Truck, HelpCircle, Check } from 'lucide-react';

const DEFAULT_STATS: PlayerStats = {
  xp: 0,
  level: 1,
  rankTitle: 'Novice Driver',
  totalLogs: 0
};

export default function App() {
  // State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'mileage' | 'expenses' | 'worklog' | 'tax' | 'settings'>('dashboard');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_STATS);
  const [showArcade, setShowArcade] = useState(false);
  const [showLiveTracker, setShowLiveTracker] = useState(false);

  // Backup tracking state
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [entriesSinceBackup, setEntriesSinceBackup] = useState(0);

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportConfig, setExportConfig] = useState({
    startDate: '',
    endDate: '',
    includeTrips: true,
    includeExpenses: true,
    includeWorkLogs: true
  });

  // Notification State
  const lastNotificationRef = useRef<string | null>(null);

  // Load from local storage
  useEffect(() => {
    const savedTrips = localStorage.getItem('driver_trips');
    const savedExpenses = localStorage.getItem('driver_expenses');
    const savedLogs = localStorage.getItem('driver_daily_logs');
    const savedSettings = localStorage.getItem('driver_settings');
    const savedStats = localStorage.getItem('driver_player_stats');

    if (savedTrips) setTrips(JSON.parse(savedTrips));
    if (savedExpenses) setExpenses(JSON.parse(savedExpenses));
    if (savedLogs) setDailyLogs(JSON.parse(savedLogs));
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      // Migration: Convert legacy single 'driverRole' to 'driverRoles' array
      if (parsed.driverRole && !parsed.driverRoles) {
        parsed.driverRoles = [parsed.driverRole];
      }
      // Fallback if empty
      if (!parsed.driverRoles || parsed.driverRoles.length === 0) {
        parsed.driverRoles = ['COURIER'];
      }
      setSettings({ ...DEFAULT_SETTINGS, ...parsed });
    }
    if (savedStats) setPlayerStats(JSON.parse(savedStats));

    // Load backup tracking
    const savedLastBackup = localStorage.getItem('driver_last_backup');
    const savedEntriesSince = localStorage.getItem('driver_entries_since_backup');
    if (savedLastBackup) setLastBackupDate(savedLastBackup);
    if (savedEntriesSince) setEntriesSinceBackup(parseInt(savedEntriesSince) || 0);
  }, []);

  // Save to local storage
  useEffect(() => localStorage.setItem('driver_trips', JSON.stringify(trips)), [trips]);
  useEffect(() => localStorage.setItem('driver_expenses', JSON.stringify(expenses)), [expenses]);
  useEffect(() => localStorage.setItem('driver_daily_logs', JSON.stringify(dailyLogs)), [dailyLogs]);
  useEffect(() => localStorage.setItem('driver_settings', JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem('driver_player_stats', JSON.stringify(playerStats)), [playerStats]);

  // Handlers
  const incrementBackupCounter = () => {
    setEntriesSinceBackup(prev => {
      const next = prev + 1;
      localStorage.setItem('driver_entries_since_backup', String(next));
      return next;
    });
  };

  const addTrip = (trip: Trip) => { setTrips([...trips, trip]); incrementBackupCounter(); };
  const deleteTrip = (id: string) => setTrips(trips.filter(t => t.id !== id));
  const updateTrip = (id: string, updates: Partial<Trip>) => {
    setTrips(trips.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const addExpense = (expense: Expense) => { setExpenses([...expenses, expense]); incrementBackupCounter(); };
  const deleteExpense = (id: string) => setExpenses(expenses.filter(e => e.id !== id));

  const addDailyLog = (log: DailyWorkLog) => { setDailyLogs([...dailyLogs, log]); incrementBackupCounter(); };
  const deleteDailyLog = (id: string) => setDailyLogs(dailyLogs.filter(l => l.id !== id));

  // Handler for Live Shift Save
  const handleLiveShiftSave = (data: { miles: number, durationHours: number, revenue: number, provider: string, path?: {lat: number, lng: number}[] }) => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Create Trip for Mileage
    if (data.miles > 0) {
      const startOdo = settings.financialYearStartOdometer 
        ? settings.financialYearStartOdometer + trips.reduce((sum, t) => sum + t.totalMiles, 0)
        : 0;
      
      addTrip({
        id: Date.now().toString() + '_trip',
        date: today,
        startLocation: 'Live Shift Start',
        endLocation: 'Live Shift End',
        startOdometer: parseFloat(startOdo.toFixed(1)),
        endOdometer: parseFloat((startOdo + data.miles).toFixed(1)),
        totalMiles: data.miles,
        purpose: 'Business',
        notes: `Live Tracked Shift (${data.durationHours.toFixed(2)}h)`,
        path: data.path
      });
    }

    // 2. Create Work Log for Efficiency/Hours
    addDailyLog({
      id: Date.now().toString() + '_log',
      date: today,
      provider: data.provider || 'Live Shift',
      revenue: data.revenue,
      hoursWorked: data.durationHours,
      fuelLiters: 0 // Optional, user can edit later
    });

    // XP Boost
    const newXp = playerStats.xp + 100; // Big bonus for live shift
    setPlayerStats({ ...playerStats, xp: newXp, totalLogs: playerStats.totalLogs + 1 });
  };

  // Backup Restore handler
  const handleRestore = (data: {
    trips: Trip[];
    expenses: Expense[];
    dailyLogs: DailyWorkLog[];
    settings: Settings;
    playerStats: PlayerStats;
  }) => {
    setTrips(data.trips);
    setExpenses(data.expenses);
    setDailyLogs(data.dailyLogs);
    setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    setPlayerStats(data.playerStats);
    setLastBackupDate(new Date().toISOString());
    setEntriesSinceBackup(0);
    localStorage.setItem('driver_last_backup', new Date().toISOString());
    localStorage.setItem('driver_entries_since_backup', '0');
  };

  const handleExport = () => {
    let csvContent = "";

    if (exportConfig.includeTrips) {
      csvContent += "MILEAGE LOG\nDate,Purpose,Start,End,Start Odo,End Odo,Total Miles,Notes\n";
      csvContent += trips.map(t => `${t.date},${t.purpose},"${t.startLocation}","${t.endLocation}",${t.startOdometer},${t.endOdometer},${t.totalMiles},"${t.notes}"`).join("\n") + "\n\n";
    }

    if (exportConfig.includeExpenses) {
      csvContent += "EXPENSES LOG\nDate,Category,Amount,Description\n";
      csvContent += expenses.map(e => `${e.date},${e.category},${e.amount},"${e.description}"`).join("\n") + "\n\n";
    }

    if (exportConfig.includeWorkLogs) {
      csvContent += "PERFORMANCE LOG\nDate,Provider,Hours,Revenue,Jobs/Drops,Fuel (Liters)\n";
      csvContent += dailyLogs.map(l => `${l.date},${l.provider},${l.hoursWorked},${l.revenue},${l.jobCount || 0},${l.fuelLiters || 0}`).join("\n") + "\n\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DriverTax_Export.csv`;
    a.click();
    setShowExportModal(false);
  };

  const toggleDriverRole = (role: DriverRole) => {
    let newRoles = [...(settings.driverRoles || [])];
    if (newRoles.includes(role)) {
      // Don't allow removing the last role
      if (newRoles.length > 1) {
        newRoles = newRoles.filter(r => r !== role);
      }
    } else {
      newRoles.push(role);
    }
    setSettings({ ...settings, driverRoles: newRoles });
  };

  const NavItem = ({ id, icon: Icon, label }: { id: typeof activeTab, icon: any, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`relative group p-3 md:w-full md:text-left rounded-xl flex flex-col md:flex-row items-center gap-3 transition-all duration-200 
        ${activeTab === id 
          ? 'text-white bg-white/10 shadow-inner' 
          : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    >
      {activeTab === id && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full hidden md:block" />
      )}
      <Icon size={24} className={`transition-transform duration-300 ${activeTab === id ? 'scale-110 text-blue-400' : ''}`} />
      <span className={`text-[10px] md:text-sm font-medium ${activeTab === id ? 'text-white' : ''}`}>{label}</span>
    </button>
  );

  const RoleOption = ({ role, icon: Icon, label, desc }: { role: DriverRole, icon: any, label: string, desc: string }) => {
    const isSelected = settings.driverRoles?.includes(role);
    return (
      <button
        onClick={() => toggleDriverRole(role)}
        className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all relative ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
      >
        {isSelected && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-0.5">
            <Check size={12} strokeWidth={4} />
          </div>
        )}
        <div className={`p-3 rounded-full mb-3 ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
          <Icon size={24} />
        </div>
        <span className={`font-bold text-sm mb-1 ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{label}</span>
        <span className="text-[10px] text-center text-slate-400 leading-tight">{desc}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pl-72 transition-all">
      <nav className="fixed bottom-0 left-0 right-0 md:top-0 md:w-72 md:h-screen bg-slate-900 md:bg-gradient-to-b md:from-slate-900 md:to-slate-900 border-t md:border-r border-slate-700/50 z-50 flex md:flex-col justify-around md:justify-start md:p-6 shadow-2xl backdrop-blur-lg md:backdrop-blur-none bg-opacity-95 md:bg-opacity-100">
        <div className="hidden md:flex items-center gap-3 mb-10 px-2">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/30">
            <ShieldCheck className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight leading-none">DriverTax<span className="text-blue-500">Pro</span></h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-1">HMRC Logbook</p>
          </div>
        </div>

        <div className="flex md:flex-col justify-around w-full gap-1 md:gap-2">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="mileage" icon={Car} label="Mileage" />
          <NavItem id="expenses" icon={Receipt} label="Expenses" />
          <NavItem id="worklog" icon={Clock} label="Work Log" />
          <NavItem id="tax" icon={Scale} label="Tax Logic" />
          <NavItem id="settings" icon={SettingsIcon} label="Settings" />
        </div>
      </nav>

      <main className="p-4 md:p-10 max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-10">
           <div>
             <h2 className="text-3xl font-bold text-slate-800 capitalize tracking-tight">{activeTab === 'worklog' ? 'Performance' : activeTab}</h2>
             <p className="text-slate-500 text-sm mt-1">Manage your self-employment records</p>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end mr-2">
                 <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Level {playerStats.level}</div>
                 <div className="text-sm font-black text-slate-800">{playerStats.rankTitle}</div>
              </div>

              {activeTab !== 'settings' && (
                <button onClick={() => setShowExportModal(true)} className="group flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-600 bg-white hover:bg-blue-50 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-blue-200 shadow-sm transition-all duration-200 active:scale-95">
                  <Download size={18} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              )}
           </div>
        </header>

        <div className="animate-fade-in-up">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <Dashboard 
                trips={trips} 
                expenses={expenses} 
                dailyLogs={dailyLogs}
                settings={settings}
                onUpdateSettings={setSettings}
                onNavigate={setActiveTab}
              />
              <TaxAssistant trips={trips} expenses={expenses} settings={settings} />
            </div>
          )}
          {activeTab === 'mileage' && (
            <MileageLog 
              trips={trips} 
              onAddTrip={addTrip} 
              onDeleteTrip={deleteTrip} 
              onUpdateTrip={updateTrip}
              settings={settings}
            />
          )}
          {activeTab === 'expenses' && <ExpenseLog expenses={expenses} onAddExpense={addExpense} onDeleteExpense={deleteExpense} />}
          {activeTab === 'worklog' && <WorkLog logs={dailyLogs} trips={trips} expenses={expenses} settings={settings} onAddLog={addDailyLog} onDeleteLog={deleteDailyLog} />}
          {activeTab === 'tax' && <TaxLogic trips={trips} expenses={expenses} dailyLogs={dailyLogs} settings={settings} onUpdateSettings={setSettings} />}
          {activeTab === 'settings' && (
            <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-sm border border-slate-200 max-w-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-slate-400" />Configuration</h3>
              <div className="space-y-8">

                 {/* Driver Role Section */}
                 <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                       <User className="w-4 h-4 text-blue-500" /> Driver Profiles
                    </h4>
                    <p className="text-xs text-slate-500 mb-4">Select all that apply. We'll customize your providers and AI advice for your specific mix of work.</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                       <RoleOption role="COURIER" icon={Package} label="Courier / Parcel" desc="DPD, Evri, Amazon" />
                       <RoleOption role="FOOD_DELIVERY" icon={Utensils} label="Food Delivery" desc="Uber Eats, Deliveroo" />
                       <RoleOption role="TAXI" icon={Car} label="Taxi / Private Hire" desc="Uber, Bolt, Taxi" />
                       <RoleOption role="LOGISTICS" icon={Truck} label="Vehicle Logistics" desc="Trade Plates, Haulage" />
                       <RoleOption role="OTHER" icon={HelpCircle} label="Other / Generic" desc="General Driving" />
                    </div>
                 </div>

                 {/* Claim Method Section */}
                 <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                       <Scale className="w-4 h-4 text-blue-500" /> Accounting Method
                    </h4>
                    
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm mb-6">
                       <button 
                         onClick={() => setSettings({...settings, claimMethod: 'SIMPLIFIED'})}
                         className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-200 ${settings.claimMethod === 'SIMPLIFIED' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                       >
                         Simplified Expenses
                       </button>
                       <button 
                         onClick={() => setSettings({...settings, claimMethod: 'ACTUAL'})}
                         className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all duration-200 ${settings.claimMethod === 'ACTUAL' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                       >
                         Actual Costs
                       </button>
                    </div>
                    {settings.claimMethod === 'SIMPLIFIED' ? (
                       <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                             <CheckCircle className="text-emerald-600 shrink-0 mt-0.5" size={18} />
                             <div className="text-sm text-emerald-900">
                                <p className="font-bold mb-1">Standard Mileage Rate</p>
                                <p className="opacity-90 leading-relaxed">You claim a fixed rate per business mile (45p for first 10k, 25p thereafter). This covers fuel, insurance, repairs, and vehicle tax.</p>
                             </div>
                          </div>
                          <p className="text-xs text-slate-500 pl-2">
                            *You cannot claim individual receipts for vehicle running costs with this method.
                          </p>
                       </div>
                    ) : (
                       <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                          <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 p-4 rounded-xl">
                             <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={18} />
                             <div className="text-sm text-orange-900">
                                <p className="font-bold mb-1">Actual Costs Basis</p>
                                <p className="opacity-90 leading-relaxed">You claim the business percentage of actual vehicle costs. You must track <strong className="font-bold">all</strong> receipts (fuel, insurance, repairs) and total annual mileage.</p>
                             </div>
                          </div>
                          <div className="text-xs text-slate-500 pl-2 border-l-2 border-orange-200 ml-1">
                            <p className="font-bold mb-1">Required Actions:</p>
                            <ul className="list-disc pl-4 space-y-1">
                               <li>Log every receipt in the Expenses tab.</li>
                               <li>Maintain a precise log of total mileage (business + personal) to prove business use %.</li>
                            </ul>
                          </div>
                       </div>
                    )}
                 </div>

                 <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-4 items-start shadow-sm">
                    <div className="bg-amber-100 p-2 rounded-full shrink-0"><AlertCircle className="w-5 h-5 text-amber-600" /></div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">Compliance Check</h4>
                      <p className="text-sm text-amber-800 mt-1 leading-relaxed">Ensure your Vehicle Registration is set for HMRC audit proofing.</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Vehicle Registration</label>
                    <input type="text" value={settings.vehicleReg} onChange={(e) => setSettings({...settings, vehicleReg: e.target.value.toUpperCase()})} className="w-full p-4 border rounded-xl uppercase font-mono text-lg tracking-widest focus:ring-4 outline-none transition-all" placeholder="AB12 CDE" />
                  </div>

                  <div className="pt-8 border-t border-slate-100">
                     <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <Gauge className="w-5 h-5 text-slate-500" />
                       Odometer Tracking (Financial Year)
                    </h4>
                    <p className="text-sm text-slate-500 mb-6">Enter your start-of-year odometer reading. This allows you to just enter daily miles, and we'll calculate the rest.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">FY Start Date</label>
                        <input 
                          type="date"
                          value={settings.financialYearStartDate}
                          onChange={(e) => setSettings({...settings, financialYearStartDate: e.target.value})}
                          className="w-full p-3 border border-slate-200 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Opening Odometer</label>
                        <input 
                          type="number"
                          value={settings.financialYearStartOdometer}
                          onChange={(e) => setSettings({...settings, financialYearStartOdometer: parseInt(e.target.value)})}
                          className="w-full p-3 border border-slate-200 rounded-xl font-mono"
                          placeholder="e.g. 45000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-slate-100">
                    <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <PiggyBank className="w-5 h-5 text-emerald-500" />
                       Financial Allocations
                    </h4>
                    <p className="text-sm text-slate-500 mb-6">Automatically calculate how much of your daily revenue to set aside.</p>
                    
                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><AlertCircle size={14} className="text-orange-500" /> HMRC / Tax Pot</label>
                          <span className="text-sm font-bold text-orange-600">{settings.taxSetAsidePercent}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="40" step="1" 
                          value={settings.taxSetAsidePercent} 
                          onChange={(e) => setSettings({...settings, taxSetAsidePercent: parseInt(e.target.value)})}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Wrench size={14} className="text-blue-500" /> Maintenance Fund</label>
                          <span className="text-sm font-bold text-blue-600">{settings.maintenanceSetAsidePercent}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="25" step="1" 
                          value={settings.maintenanceSetAsidePercent} 
                          onChange={(e) => setSettings({...settings, maintenanceSetAsidePercent: parseInt(e.target.value)})}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-2">
                          <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><CreditCard size={14} className="text-purple-500" /> Debt Repayment</label>
                          <span className="text-sm font-bold text-purple-600">{settings.debtSetAsidePercent}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="50" step="1" 
                          value={settings.debtSetAsidePercent} 
                          onChange={(e) => setSettings({...settings, debtSetAsidePercent: parseInt(e.target.value)})}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Backup & Restore */}
                  <div className="pt-8 border-t border-slate-100">
                    <BackupRestore
                      trips={trips}
                      expenses={expenses}
                      dailyLogs={dailyLogs}
                      settings={settings}
                      playerStats={playerStats}
                      onRestore={handleRestore}
                      lastBackupDate={lastBackupDate}
                      entriesSinceBackup={entriesSinceBackup}
                    />
                  </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 md:bottom-10 right-6 md:right-10 flex flex-col gap-4 z-[60]">
        
        {/* Go Online Button */}
        <button 
          onClick={() => setShowLiveTracker(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-full shadow-2xl shadow-emerald-500/50 hover:scale-110 active:scale-90 transition-all group relative"
        >
          <Navigation className="w-8 h-8 fill-current" />
          <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Go Online (Live GPS)
          </span>
        </button>

        {/* Quick Log Button */}
        <button 
          onClick={() => setShowArcade(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-2xl shadow-blue-500/50 hover:scale-110 active:scale-90 transition-all group relative"
        >
          <Zap className="w-8 h-8 fill-current" />
          <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Quick Log (Arcade)
          </span>
        </button>
      </div>

      {/* Overlays */}
      <LiveTracker 
        isOpen={showLiveTracker}
        setIsOpen={setShowLiveTracker}
        onSaveSession={handleLiveShiftSave}
      />

      <ArcadeMode 
        isOpen={showArcade} 
        onClose={() => setShowArcade(false)}
        onAddTrip={addTrip}
        onAddExpense={addExpense}
        onAddLog={addDailyLog}
        playerStats={playerStats}
        onUpdateStats={setPlayerStats}
      />

      {/* Export Modal Logic... */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-800">Export Records</h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
               <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer">
                 <input type="checkbox" checked={exportConfig.includeTrips} onChange={e => setExportConfig({...exportConfig, includeTrips: e.target.checked})} />
                 <span className="text-sm font-bold">Mileage Log</span>
               </label>
               <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer">
                 <input type="checkbox" checked={exportConfig.includeExpenses} onChange={e => setExportConfig({...exportConfig, includeExpenses: e.target.checked})} />
                 <span className="text-sm font-bold">Expenses</span>
               </label>
               <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer">
                 <input type="checkbox" checked={exportConfig.includeWorkLogs} onChange={e => setExportConfig({...exportConfig, includeWorkLogs: e.target.checked})} />
                 <span className="text-sm font-bold">Performance (Work Logs)</span>
               </label>
            </div>
            <div className="p-6 bg-slate-50 border-t flex justify-end">
               <button onClick={handleExport} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2"><Download size={18} />Download CSV</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}