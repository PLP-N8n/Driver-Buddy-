import React, { useState, useEffect } from 'react';
import { Trip, Settings } from '../types';
import { DatePicker } from './DatePicker';
import { Plus, MapPin, Trash2, FileText, ChevronUp, AlertCircle, Search, X, CalendarIcon, Navigation, Sparkles, Loader2, ChevronDown, Gauge } from 'lucide-react';
import { getQuickAdvice } from '../services/geminiService';

interface MileageLogProps {
  trips: Trip[];
  onAddTrip: (trip: Trip) => void;
  onDeleteTrip: (id: string) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
  settings: Settings;
}

export const MileageLog: React.FC<MileageLogProps> = ({ trips, onAddTrip, onDeleteTrip, onUpdateTrip, settings }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Calculate the current live odometer based on settings + all logged trips
  const calculateLiveOdometer = () => {
    const milesSinceStart = trips
      .filter(t => t.date >= settings.financialYearStartDate)
      .reduce((sum, t) => sum + t.totalMiles, 0);
    return (settings.financialYearStartOdometer || 0) + milesSinceStart;
  };

  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    date: new Date().toISOString().split('T')[0],
    purpose: 'Business',
    startLocation: '',
    endLocation: '',
    startOdometer: 0,
    endOdometer: 0,
    notes: ''
  });

  // When form opens, auto-fill start odometer
  useEffect(() => {
    if (isFormOpen && (!newTrip.startOdometer || newTrip.startOdometer === 0)) {
      setNewTrip(prev => ({
        ...prev,
        startOdometer: parseFloat(calculateLiveOdometer().toFixed(1))
      }));
    }
  }, [isFormOpen]);

  const handleTotalMilesChange = (val: string) => {
    const miles = parseFloat(val);
    if (!isNaN(miles)) {
      const start = newTrip.startOdometer || 0;
      setNewTrip(prev => ({
        ...prev,
        totalMiles: miles,
        endOdometer: parseFloat((start + miles).toFixed(1))
      }));
    } else {
      setNewTrip(prev => ({ ...prev, totalMiles: 0 }));
    }
  };

  const handleOdometerChange = (type: 'start' | 'end', value: string) => {
    const val = value === '' ? 0 : parseFloat(value);
    const updatedTrip = { ...newTrip, [type === 'start' ? 'startOdometer' : 'endOdometer']: val };
    
    // Auto-calculate total miles if both exist
    if (updatedTrip.endOdometer && updatedTrip.startOdometer && updatedTrip.endOdometer > updatedTrip.startOdometer) {
      updatedTrip.totalMiles = parseFloat((updatedTrip.endOdometer - updatedTrip.startOdometer).toFixed(1));
    }
    setNewTrip(updatedTrip);
  };

  const handleSmartFill = async () => {
    if (!newTrip.startLocation || !newTrip.endLocation) {
      alert("Please enter start and end locations first.");
      return;
    }
    setIsSuggesting(true);
    
    try {
      const rolesString = (settings.driverRoles || ['COURIER']).join(', ').toLowerCase().replace('_', ' ');
      const response = await getQuickAdvice(
        `As a UK multi-role driver (${rolesString}) logbook assistant, analyze a trip from "${newTrip.startLocation}" to "${newTrip.endLocation}". 
        Return a single line in this format: PURPOSE|DESCRIPTION
        1. PURPOSE must be exactly one of: Business, Personal, Commute.
        2. DESCRIPTION should be a short 3-6 word professional reason for HMRC logs relevant to one of these roles.
        Example: Business|Delivery round to city center
        `
      );

      if (response && response.includes('|')) {
        const [suggestedPurpose, suggestedNotes] = response.split('|');
        const cleanPurpose = suggestedPurpose.trim();
        const cleanNotes = suggestedNotes.trim();

        setNewTrip(prev => ({ 
          ...prev, 
          purpose: ['Business', 'Personal', 'Commute'].includes(cleanPurpose) ? (cleanPurpose as any) : prev.purpose,
          notes: cleanNotes
        }));
      } else if (response) {
        setNewTrip(prev => ({ ...prev, notes: response }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newTrip.totalMiles || newTrip.totalMiles <= 0) {
      setError("Please enter a valid mileage.");
      return;
    }
    onAddTrip({
      id: Date.now().toString(),
      date: newTrip.date!,
      startLocation: newTrip.startLocation || 'Unknown',
      endLocation: newTrip.endLocation || 'Unknown',
      startOdometer: newTrip.startOdometer || 0,
      endOdometer: newTrip.endOdometer || 0,
      totalMiles: newTrip.totalMiles!,
      purpose: (newTrip.purpose as 'Business' | 'Personal' | 'Commute') || 'Business',
      notes: newTrip.notes || ''
    });

    const nextStartOdo = (newTrip.endOdometer && newTrip.endOdometer > 0) 
      ? newTrip.endOdometer 
      : ((newTrip.startOdometer || 0) + (newTrip.totalMiles || 0));

    // Reset form, auto-ready for next trip
    setNewTrip({
      date: new Date().toISOString().split('T')[0],
      purpose: 'Business',
      startLocation: '',
      endLocation: '',
      startOdometer: nextStartOdo,
      endOdometer: 0,
      totalMiles: 0,
      notes: ''
    });
    setIsFormOpen(false);
  };

  const filteredTrips = trips.filter(trip => {
    const query = searchQuery.toLowerCase();
    return (
      trip.startLocation.toLowerCase().includes(query) ||
      trip.endLocation.toLowerCase().includes(query) ||
      (trip.notes && trip.notes.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col-reverse md:flex-row md:justify-between md:items-center gap-4">
        <div className="relative group flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl leading-5 bg-white focus:ring-2 focus:ring-blue-500 sm:text-sm shadow-sm transition-all"
            placeholder="Search journeys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-blue-600 text-white px-5 py-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
        >
          {isFormOpen ? <ChevronUp size={18} /> : <Plus size={18} />}
          New Journey
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl border border-slate-100 animate-slide-down relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DatePicker label="Date" value={newTrip.date || ''} onChange={(date) => setNewTrip({ ...newTrip, date })} />
              
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Purpose</label>
                <div className="relative">
                   <select
                    value={newTrip.purpose}
                    onChange={(e) => setNewTrip({ ...newTrip, purpose: e.target.value as any })}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium appearance-none"
                   >
                    <option value="Business">Business</option>
                    <option value="Personal">Personal</option>
                    <option value="Commute">Commute (Private)</option>
                   </select>
                   <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">From</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input type="text" placeholder="Start Location" value={newTrip.startLocation} onChange={(e) => setNewTrip({ ...newTrip, startLocation: e.target.value })} className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">To</label>
                  <div className="relative">
                     <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                     <input type="text" placeholder="Destination" value={newTrip.endLocation} onChange={(e) => setNewTrip({ ...newTrip, endLocation: e.target.value })} className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>

              {/* AI Smart Fill Button */}
              <div className="flex justify-end">
                 <button 
                   type="button" 
                   onClick={handleSmartFill} 
                   disabled={isSuggesting || !newTrip.startLocation || !newTrip.endLocation}
                   className="text-xs flex items-center gap-1.5 bg-indigo-50 text-indigo-700 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                 >
                   {isSuggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                   {isSuggesting ? 'Analyzing...' : 'Auto-Suggest Purpose & Reason'}
                 </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase">Reason for Journey</label>
              </div>
              <textarea
                rows={2}
                placeholder="e.g. Courier Round #42"
                value={newTrip.notes}
                onChange={(e) => setNewTrip({ ...newTrip, notes: e.target.value })}
                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all"
              />
            </div>

            {/* Odometer Section - Redesigned for daily flow */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
               <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                 <Gauge size={14} /> Mileage Calculator
               </h4>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="order-2 md:order-1">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">Start Odometer</label>
                    <input type="number" value={newTrip.startOdometer || ''} onChange={(e) => handleOdometerChange('start', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-400 bg-white" placeholder="0" />
                  </div>
                  
                  {/* Total Miles is now primary */}
                  <div className="order-1 md:order-2">
                    <label className="block text-[10px] font-bold text-blue-600 mb-1">Daily Miles Driven</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        required 
                        step="0.1" 
                        value={newTrip.totalMiles || ''} 
                        onChange={(e) => handleTotalMilesChange(e.target.value)} 
                        className="w-full p-2 pl-3 border-2 border-blue-500/30 focus:border-blue-500 rounded-lg text-lg font-black text-slate-800 bg-white shadow-sm outline-none transition-colors" 
                        placeholder="0.0" 
                        autoFocus
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">mi</span>
                    </div>
                  </div>

                  <div className="order-3">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">End Odometer (Auto)</label>
                    <input type="number" value={newTrip.endOdometer || ''} onChange={(e) => handleOdometerChange('end', e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-400 bg-slate-100" placeholder="0" />
                  </div>
               </div>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-700 transition-all transform active:scale-[0.98]">Save Journey</button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {filteredTrips.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(trip => (
          <div key={trip.id} className={`bg-white rounded-xl p-5 border-l-4 transition-all hover:shadow-md ${trip.purpose === 'Business' ? 'border-l-blue-500' : trip.purpose === 'Personal' ? 'border-l-orange-400' : 'border-l-slate-400'} shadow-sm flex items-center justify-between`}>
             <div className="flex-1">
               <div className="flex items-center gap-3 mb-1">
                 <span className="text-xs font-bold text-slate-500">{trip.date}</span>
                 <div className="relative inline-block">
                   <select 
                      value={trip.purpose}
                      onChange={(e) => onUpdateTrip(trip.id, { purpose: e.target.value as any })}
                      className={`text-[10px] font-bold uppercase pl-2 pr-6 py-0.5 rounded cursor-pointer border-none focus:ring-1 focus:ring-offset-1 focus:ring-slate-300 outline-none transition-all appearance-none text-left min-w-[90px] ${
                        trip.purpose === 'Business' ? 'bg-blue-50 text-blue-700' : 
                        trip.purpose === 'Personal' ? 'bg-orange-50 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <option value="Business">Business</option>
                      <option value="Personal">Personal</option>
                      <option value="Commute">Commute</option>
                    </select>
                    <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                 </div>
               </div>
               <p className="text-slate-800 font-bold">{trip.startLocation} → {trip.endLocation}</p>
               <div className="flex flex-col gap-0.5 mt-1">
                  {trip.notes && <p className="text-xs text-slate-500 italic">{trip.notes}</p>}
                  {(trip.startOdometer > 0 || trip.endOdometer > 0) && (
                    <p className="text-[10px] text-slate-400">Odo: {trip.startOdometer} - {trip.endOdometer}</p>
                  )}
               </div>
             </div>
             <div className="flex items-center gap-6">
                <div className="text-right">
                  <span className="block text-2xl font-black text-slate-800">{trip.totalMiles.toFixed(1)}</span>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Miles</span>
                </div>
                <button onClick={() => onDeleteTrip(trip.id)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete entry"><Trash2 size={18} /></button>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};