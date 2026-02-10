import React, { useState } from 'react';
import { askDetailedAssistant } from '../services/geminiService';
import { Bot, Send, Loader2, Sparkles } from 'lucide-react';
import { Trip, Expense, Settings } from '../types';

interface TaxAssistantProps {
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
}

export const TaxAssistant: React.FC<TaxAssistantProps> = ({ trips, expenses, settings }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse(null);

    const sortedTrips = [...trips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const sortedExpenses = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const recentTripsStr = sortedTrips.slice(0, 5)
      .map(t => `- ${t.date}: ${t.purpose} (${t.totalMiles}mi) from ${t.startLocation} to ${t.endLocation}`)
      .join('\n');

    const recentExpensesStr = sortedExpenses.slice(0, 5)
      .map(e => `- ${e.date}: ${e.category} £${e.amount} (${e.description})`)
      .join('\n');

    const rolesString = (settings.driverRoles || ['COURIER']).join(', ');

    const context = `
      Current Log Stats:
      - Driver Roles: ${rolesString}
      - Vehicle: ${settings.vehicleReg || 'Not set'}
      - Claim Method: ${settings.claimMethod}
      - Total Business Miles: ${trips.filter(t => t.purpose === 'Business').reduce((sum, t) => sum + t.totalMiles, 0).toFixed(1)}
      
      Recent Activity:
      ${recentTripsStr}
      ${recentExpensesStr}
    `;

    const answer = await askDetailedAssistant(query, context);
    setResponse(answer);
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-4 flex items-center justify-between">
         <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
            <Sparkles className="w-5 h-5 text-indigo-100" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">AI Tax Expert</h3>
            <p className="text-indigo-200 text-xs">Powered by Gemini 3 Pro</p>
          </div>
         </div>
         <div className="text-[10px] bg-white/10 text-white px-2 py-1 rounded border border-white/20">
            PRO
         </div>
      </div>

      <div className="p-6 bg-slate-50 min-h-[200px] max-h-[400px] overflow-y-auto flex flex-col gap-4">
        {!response && !loading && (
           <div className="flex flex-col items-center justify-center py-8 text-center opacity-70">
              <Bot className="w-12 h-12 text-indigo-300 mb-3" />
              <p className="text-slate-500 text-sm font-medium">Ask complex tax questions.<br/>I'm trained on the latest HMRC guidelines.</p>
           </div>
        )}

        {loading && (
          <div className="self-start max-w-[80%] flex items-start gap-2">
            <div className="bg-white p-1.5 rounded-full border border-indigo-100 shadow-sm shrink-0">
               <Sparkles size={16} className="text-indigo-500 animate-pulse" />
            </div>
            <div className="bg-white border border-slate-100 text-slate-600 text-sm px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Analyzing regulations...</span>
            </div>
          </div>
        )}

        {response && (
           <div className="self-start max-w-[90%] flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-indigo-50 p-1.5 rounded-full border border-indigo-100 shadow-sm shrink-0 mt-1">
                 <Bot size={18} className="text-indigo-600" />
              </div>
              <div className="bg-white border border-slate-100 text-slate-700 text-sm px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm whitespace-pre-wrap">
                 {response}
              </div>
            </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex gap-2 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder="e.g. Can I claim for a laptop used for delivery rounds?"
            className="flex-1 pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
          />
          <button
            onClick={handleAsk}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white p-1.5 rounded-lg transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};