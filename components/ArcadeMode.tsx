import React, { useState, useEffect } from 'react';
import { Trip, Expense, DailyWorkLog, ExpenseCategory, PlayerStats } from '../types';
import { X, Zap, Car, Receipt, TrendingUp, Trophy, Star, ChevronRight, Check } from 'lucide-react';

interface ArcadeModeProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrip: (trip: Trip) => void;
  onAddExpense: (expense: Expense) => void;
  onAddLog: (log: DailyWorkLog) => void;
  playerStats: PlayerStats;
  onUpdateStats: (stats: PlayerStats) => void;
}

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5000];
const RANKS = ['Novice Driver', 'Learner Log', 'Data Rookie', 'Record Keeper', 'Audit Shield', 'Tax Pro', 'Ledger Legend', 'Fiscal Master', 'HMRC Hero', 'Grand Fleet Commander'];

export const ArcadeMode: React.FC<ArcadeModeProps> = ({ 
  isOpen, onClose, onAddTrip, onAddExpense, onAddLog, playerStats, onUpdateStats 
}) => {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'input' | 'expense-cat' | 'provider-select' | 'trip-details'>('input');
  const [tempData, setTempData] = useState<any>({});
  const [showReward, setShowReward] = useState(false);
  const [rewardMessage, setRewardMessage] = useState('');

  // XP Calculation
  const addXp = (amount: number, message: string) => {
    const newXp = playerStats.xp + amount;
    const newTotalLogs = playerStats.totalLogs + 1;
    
    // Check level up
    let newLevel = playerStats.level;
    let newRank = playerStats.rankTitle;
    
    // Find highest threshold exceeded
    const levelIndex = LEVEL_THRESHOLDS.findIndex(t => newXp < t);
    const calculatedLevel = levelIndex === -1 ? LEVEL_THRESHOLDS.length : levelIndex;
    
    if (calculatedLevel > newLevel) {
      newLevel = calculatedLevel;
      newRank = RANKS[newLevel - 1] || RANKS[RANKS.length - 1];
      setRewardMessage(`LEVEL UP! ${newRank}`);
    } else {
      setRewardMessage(`+${amount} XP: ${message}`);
    }

    onUpdateStats({
      xp: newXp,
      level: newLevel,
      rankTitle: newRank,
      totalLogs: newTotalLogs
    });

    setShowReward(true);
    setTimeout(() => {
      setShowReward(false);
      onClose();
      resetForm();
    }, 1500);
  };

  const resetForm = () => {
    setInputValue('');
    setMode('input');
    setTempData({});
  };

  // Handlers
  const handleMileageSelect = () => {
    const miles = parseFloat(inputValue);
    // Auto-save simplified business trip
    onAddTrip({
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      startLocation: 'Quick Entry',
      endLocation: 'Business Round',
      startOdometer: 0,
      endOdometer: miles,
      totalMiles: miles,
      purpose: 'Business',
      notes: 'Logged via Arcade Mode'
    });
    addXp(20, 'Journey Logged');
  };

  const handleExpenseInit = () => {
    setTempData({ amount: parseFloat(inputValue) });
    setMode('expense-cat');
  };

  const handleExpenseSave = (category: string) => {
    onAddExpense({
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      category: category as ExpenseCategory,
      amount: tempData.amount,
      description: 'Quick Arcade Entry',
      receiptUrl: ''
    });
    addXp(15, 'Expense Tracked');
  };

  const handleRevenueInit = () => {
    setTempData({ amount: parseFloat(inputValue) });
    setMode('provider-select');
  };

  const handleRevenueSave = (provider: string) => {
    onAddLog({
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      provider: provider,
      hoursWorked: 0, // Default to 0 if not entered, user can edit later
      revenue: tempData.amount,
      fuelLiters: 0
    });
    addXp(30, 'Earnings Secured');
  };

  if (!isOpen) return null;

  const currentLevelXp = LEVEL_THRESHOLDS[playerStats.level - 1] || 0;
  const nextLevelXp = LEVEL_THRESHOLDS[playerStats.level] || 10000;
  const progressPercent = ((playerStats.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
      
      {/* Top Bar: Stats */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 rotate-3 border-4 border-white/10">
                <Trophy className="text-white w-8 h-8" />
             </div>
             <div className="absolute -bottom-2 -right-2 bg-slate-800 text-white text-xs font-black px-2 py-1 rounded-full border-2 border-slate-700">
               Lvl {playerStats.level}
             </div>
          </div>
          <div>
            <h2 className="text-white font-black text-xl italic tracking-wider">{playerStats.rankTitle}</h2>
            <div className="w-48 h-3 bg-slate-700 rounded-full mt-2 overflow-hidden border border-slate-600">
              <div 
                className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-slate-400 text-xs font-bold mt-1">{playerStats.xp} / {nextLevelXp} XP</p>
          </div>
        </div>
        <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Main Interaction Area */}
      <div className="w-full max-w-lg relative">
        
        {showReward ? (
          <div className="text-center animate-in zoom-in bounce-in duration-500">
             <Star className="w-24 h-24 text-yellow-400 mx-auto mb-4 animate-spin-slow" fill="currentColor" />
             <h1 className="text-4xl font-black text-white mb-2 italic">AWESOME!</h1>
             <p className="text-xl font-bold text-yellow-400">{rewardMessage}</p>
          </div>
        ) : (
          <>
            {mode === 'input' && (
              <div className="flex flex-col items-center space-y-8 animate-in slide-in-from-bottom-10">
                <label className="text-slate-400 font-bold uppercase tracking-widest text-sm">Enter Value</label>
                <div className="relative w-full">
                  <input
                    type="number"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full bg-transparent text-center text-7xl font-black text-white placeholder-slate-700 outline-none border-b-4 border-slate-700 focus:border-blue-500 transition-all pb-4"
                  />
                  {inputValue && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                       <button onClick={handleMileageSelect} className="group bg-blue-600 hover:bg-blue-500 p-6 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-blue-900/20 border border-blue-400/20">
                          <Car className="w-8 h-8 text-white mb-2 mx-auto group-hover:rotate-12 transition-transform" />
                          <div className="text-blue-100 text-xs font-bold uppercase">Drive</div>
                          <div className="text-white font-black text-xl">{inputValue} mi</div>
                       </button>

                       <button onClick={handleRevenueInit} className="group bg-emerald-600 hover:bg-emerald-500 p-6 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-emerald-900/20 border border-emerald-400/20">
                          <TrendingUp className="w-8 h-8 text-white mb-2 mx-auto group-hover:-translate-y-1 transition-transform" />
                          <div className="text-emerald-100 text-xs font-bold uppercase">Earn</div>
                          <div className="text-white font-black text-xl">£{inputValue}</div>
                       </button>

                       <button onClick={handleExpenseInit} className="group bg-orange-600 hover:bg-orange-500 p-6 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-orange-900/20 border border-orange-400/20">
                          <Receipt className="w-8 h-8 text-white mb-2 mx-auto group-hover:rotate-12 transition-transform" />
                          <div className="text-orange-100 text-xs font-bold uppercase">Spend</div>
                          <div className="text-white font-black text-xl">£{inputValue}</div>
                       </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mode === 'expense-cat' && (
              <div className="text-center animate-in slide-in-from-right">
                <h3 className="text-2xl font-bold text-white mb-6">What did you buy for <span className="text-orange-400">£{tempData.amount}</span>?</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.values(ExpenseCategory).map((cat) => (
                    <button 
                      key={cat}
                      onClick={() => handleExpenseSave(cat)}
                      className="bg-slate-800 hover:bg-orange-600 text-slate-300 hover:text-white p-4 rounded-xl font-bold text-sm transition-all border border-slate-700 hover:border-orange-500"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button onClick={() => setMode('input')} className="mt-8 text-slate-500 hover:text-white text-sm font-bold">Cancel</button>
              </div>
            )}

            {mode === 'provider-select' && (
               <div className="text-center animate-in slide-in-from-right">
                <h3 className="text-2xl font-bold text-white mb-6">Who paid you <span className="text-emerald-400">£{tempData.amount}</span>?</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {['Amazon', 'Uber Eats', 'Deliveroo', 'Just Eat', 'Evri', 'DPD', 'Private'].map((prov) => (
                    <button 
                      key={prov}
                      onClick={() => handleRevenueSave(prov)}
                      className="bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white p-4 rounded-xl font-bold text-sm transition-all border border-slate-700 hover:border-emerald-500"
                    >
                      {prov}
                    </button>
                  ))}
                </div>
                <button onClick={() => setMode('input')} className="mt-8 text-slate-500 hover:text-white text-sm font-bold">Cancel</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="absolute bottom-6 text-slate-500 text-xs font-medium uppercase tracking-widest">
        Arcade Mode Active
      </div>
    </div>
  );
};