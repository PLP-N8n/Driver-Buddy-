import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, MapPin, Clock, AlertCircle, Save, Navigation, Zap, Pause, RotateCcw, CheckCircle } from 'lucide-react';

interface LiveTrackerProps {
  onSaveSession: (data: {
    miles: number;
    durationHours: number;
    revenue: number;
    provider: string;
    path?: {lat: number, lng: number}[];
  }) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const LiveTracker: React.FC<LiveTrackerProps> = ({ onSaveSession, isOpen, setIsOpen }) => {
  const [status, setStatus] = useState<'idle' | 'tracking' | 'paused' | 'summary'>('idle');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceMiles, setDistanceMiles] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0); // mph
  const [locations, setLocations] = useState<{lat: number, lng: number, timestamp: number}[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Summary Form State
  const [revenue, setRevenue] = useState('');
  const [provider, setProvider] = useState('');

  // Refs for intervals and watch IDs
  const watchIdRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLocationRef = useRef<{lat: number, lng: number} | null>(null);

  // Helper: Haversine Distance
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3958.8; // Radius of Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setStatus('tracking');
    setStartTime(Date.now());
    setError(null);

    // Start Timer
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    // Start GPS Watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, accuracy } = position.coords;

        // Ignore low accuracy points (> 50 meters)
        if (accuracy > 50) return;

        const newPoint = { lat: latitude, lng: longitude, timestamp: position.timestamp };
        
        // Update Speed (convert m/s to mph)
        if (speed !== null) setCurrentSpeed(speed * 2.23694);

        // Calculate Distance
        if (lastLocationRef.current) {
          const dist = calculateDistance(
            lastLocationRef.current.lat, 
            lastLocationRef.current.lng, 
            latitude, 
            longitude
          );
          
          // Filter noise: ignore very tiny movements (< 5 meters ~ 0.003 miles) to prevent drift while stationary
          if (dist > 0.003) {
            setDistanceMiles(prev => prev + dist);
            lastLocationRef.current = newPoint;
            setLocations(prev => [...prev, newPoint]);
          }
        } else {
          lastLocationRef.current = newPoint;
          setLocations([newPoint]);
        }
      },
      (err) => {
        console.error(err);
        setError("GPS Signal Lost. Please check permissions.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const pauseTracking = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    // Reset last location so we don't calculate the 'jump' distance if user moves while paused
    lastLocationRef.current = null;
    setStatus('paused');
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setStatus('summary');
  };

  const resetTracker = () => {
    setStatus('idle');
    setElapsedSeconds(0);
    setDistanceMiles(0);
    setLocations([]);
    setRevenue('');
    setProvider('');
    lastLocationRef.current = null;
    setError(null);
  };

  const handleSave = () => {
    const hours = elapsedSeconds / 3600;
    const rev = parseFloat(revenue) || 0;
    
    onSaveSession({
      miles: parseFloat(distanceMiles.toFixed(2)),
      durationHours: parseFloat(hours.toFixed(2)),
      revenue: rev,
      provider: provider || 'Live Shift',
      path: locations
    });
    
    resetTracker();
    setIsOpen(false);
  };

  // Format Helpers
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen && status === 'idle') return null;

  return (
    <div className={`fixed inset-0 z-[70] bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      
      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${status === 'tracking' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-600'}`}>
            <Navigation className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-white font-black text-xl tracking-tight">
              {status === 'tracking' ? 'LIVE TRACKING' : status === 'paused' ? 'PAUSED' : status === 'summary' ? 'SHIFT SUMMARY' : 'SHIFT TRACKER'}
            </h2>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
              {status === 'tracking' ? 'GPS Active • Recording' : status === 'paused' ? 'Tracking Suspended' : 'Review & Save'}
            </p>
          </div>
        </div>
        {status !== 'tracking' && status !== 'paused' && (
          <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white transition-colors">Close</button>
        )}
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="absolute top-24 bg-red-500/10 border border-red-500 text-red-200 px-4 py-2 rounded-lg flex items-center gap-2 text-sm mb-4">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* IDLE STATE */}
      {status === 'idle' && (
        <div className="text-center animate-in zoom-in duration-300">
           <div className="w-48 h-48 rounded-full border-4 border-slate-700 flex items-center justify-center mx-auto mb-8 relative">
              <div className="absolute inset-0 bg-blue-500/10 rounded-full animate-ping opacity-20"></div>
              <button 
                onClick={startTracking}
                className="w-40 h-40 bg-blue-600 hover:bg-blue-500 rounded-full flex flex-col items-center justify-center transition-all transform hover:scale-105 shadow-2xl shadow-blue-500/50 group"
              >
                 <Play className="w-12 h-12 text-white fill-current mb-1 ml-1 group-hover:scale-110 transition-transform" />
                 <span className="text-blue-100 font-bold text-sm uppercase tracking-wider">Start Shift</span>
              </button>
           </div>
           <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
             We'll track your miles and time automatically using high-accuracy GPS.
           </p>
        </div>
      )}

      {/* TRACKING / PAUSED STATE */}
      {(status === 'tracking' || status === 'paused') && (
         <div className="w-full max-w-md space-y-8 animate-in slide-in-from-bottom-10">
            {/* Metrics Display */}
            <div className="grid grid-cols-2 gap-4">
               <div className={`bg-slate-800 p-6 rounded-2xl border ${status === 'paused' ? 'border-orange-500/50' : 'border-slate-700'} text-center transition-colors`}>
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-2"><Clock size={14} /> Duration</div>
                  <div className="text-4xl font-mono font-black text-white tabular-nums tracking-wider">
                    {formatTime(elapsedSeconds)}
                  </div>
               </div>
               <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center">
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2 flex justify-center items-center gap-2"><MapPin size={14} /> Distance</div>
                  <div className="text-4xl font-mono font-black text-emerald-400 tabular-nums tracking-wider">
                    {distanceMiles.toFixed(2)} <span className="text-sm font-bold text-emerald-600">mi</span>
                  </div>
               </div>
            </div>
            
            <div className="flex justify-center">
              <div className="bg-slate-800 px-6 py-2 rounded-full border border-slate-700 flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${status === 'tracking' ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`} />
                 <span className="text-xs font-mono text-slate-400">Current Speed: {currentSpeed.toFixed(1)} mph</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-4 pt-8">
               {status === 'tracking' ? (
                 <button 
                   onClick={pauseTracking}
                   className="flex-1 py-4 bg-orange-500/10 hover:bg-orange-600 rounded-xl border border-orange-500/50 hover:border-orange-500 transition-all flex items-center justify-center gap-3 group"
                 >
                   <Pause className="w-6 h-6 text-orange-500 group-hover:text-white fill-current" />
                   <span className="font-bold text-orange-500 group-hover:text-white uppercase tracking-wider">Pause</span>
                 </button>
               ) : (
                 <button 
                   onClick={startTracking}
                   className="flex-1 py-4 bg-emerald-500/10 hover:bg-emerald-600 rounded-xl border border-emerald-500/50 hover:border-emerald-500 transition-all flex items-center justify-center gap-3 group"
                 >
                   <Play className="w-6 h-6 text-emerald-500 group-hover:text-white fill-current" />
                   <span className="font-bold text-emerald-500 group-hover:text-white uppercase tracking-wider">Resume</span>
                 </button>
               )}

               <button 
                 onClick={stopTracking}
                 className="flex-1 py-4 bg-red-500/10 hover:bg-red-600 rounded-xl border border-red-500/50 hover:border-red-500 transition-all flex items-center justify-center gap-3 group"
               >
                 <Square className="w-6 h-6 text-red-500 group-hover:text-white fill-current" />
                 <span className="font-bold text-red-500 group-hover:text-white uppercase tracking-wider">End Shift</span>
               </button>
            </div>
         </div>
      )}

      {/* SUMMARY STATE */}
      {status === 'summary' && (
         <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl animate-in slide-in-from-bottom-10">
            <h3 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <CheckCircle className="text-emerald-500" /> Shift Complete
            </h3>
            
            <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center mb-6 border border-slate-100">
               <div className="text-center flex-1 border-r border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase">Miles</p>
                  <p className="text-2xl font-black text-slate-800">{distanceMiles.toFixed(2)}</p>
               </div>
               <div className="text-center flex-1">
                  <p className="text-xs font-bold text-slate-400 uppercase">Time</p>
                  <p className="text-2xl font-black text-slate-800">{formatTime(elapsedSeconds)}</p>
               </div>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Earnings (£)</label>
                <input 
                  type="number" 
                  step="0.01"
                  autoFocus
                  placeholder="0.00"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xl font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              
              <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Primary Provider</label>
                 <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                   {['Uber', 'Amazon', 'Deliveroo', 'Just Eat', 'Private'].map(p => (
                     <button 
                       key={p}
                       onClick={() => setProvider(p)}
                       className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap border transition-all ${provider === p ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                     >
                       {p}
                     </button>
                   ))}
                 </div>
              </div>
            </div>

            {revenue && parseFloat(revenue) > 0 && distanceMiles > 0 && (
              <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                 <p className="text-xs font-bold text-emerald-800 uppercase mb-2">Shift Efficiency</p>
                 <div className="flex justify-between">
                    <div>
                       <span className="text-lg font-black text-emerald-600">£{(parseFloat(revenue) / (elapsedSeconds/3600)).toFixed(2)}</span>
                       <span className="text-[10px] text-emerald-600 font-bold"> / hr</span>
                    </div>
                    <div>
                       <span className="text-lg font-black text-emerald-600">£{(parseFloat(revenue) / distanceMiles).toFixed(2)}</span>
                       <span className="text-[10px] text-emerald-600 font-bold"> / mi</span>
                    </div>
                 </div>
              </div>
            )}

            <div className="flex gap-3">
               <button onClick={resetTracker} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Discard</button>
               <button onClick={handleSave} className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                 <Save size={18} /> Save Records
               </button>
            </div>
         </div>
      )}

    </div>
  );
};