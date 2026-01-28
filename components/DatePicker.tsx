import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, label, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Helper to parse YYYY-MM-DD to local Date
  const parseDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const [viewDate, setViewDate] = useState(parseDate(value));

  useEffect(() => {
    if (value) {
      setViewDate(parseDate(value));
    }
  }, [value, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); // 0 = Sun

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDayClick = (day: number) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // Format YYYY-MM-DD
    const yStr = year;
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    
    onChange(`${yStr}-${mStr}-${dStr}`);
    setIsOpen(false);
  };

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();
  const days = daysInMonth(currentYear, currentMonth);
  const startDay = firstDayOfMonth(currentYear, currentMonth);
  
  // UK starts Monday (0 = Mon, 6 = Sun)
  // Native getDay: 0=Sun, 1=Mon
  // Adjustment: (day + 6) % 7. Sun(0)->6. Mon(1)->0.
  const startDayAdjusted = (startDay + 6) % 7;

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const renderCalendar = () => {
    const daysArray = [];
    // Empty slots
    for (let i = 0; i < startDayAdjusted; i++) {
      daysArray.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }
    // Days
    for (let i = 1; i <= days; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = value === dateStr;
      const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, i).toDateString();
      
      daysArray.push(
        <button
          key={i}
          type="button"
          onClick={() => handleDayClick(i)}
          className={`h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors
            ${isSelected ? 'bg-indigo-600 text-white font-bold shadow-md' : 
              isToday ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-100 text-slate-700'}
          `}
        >
          {i}
        </button>
      );
    }
    return daysArray;
  };

  return (
    <div className={`relative ${className || ''}`} ref={containerRef}>
      {label && <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 border border-slate-300 rounded-lg flex items-center gap-2 cursor-pointer hover:border-indigo-400 bg-white transition-colors"
      >
        <CalendarIcon size={18} className="text-slate-400" />
        <span className={value ? "text-slate-800 font-medium" : "text-slate-400"}>
          {value ? new Date(parseDate(value)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select Date'}
        </span>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-72 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"><ChevronLeft size={20} /></button>
            <span className="font-bold text-slate-800">{monthNames[currentMonth]} {currentYear}</span>
            <button type="button" onClick={handleNextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"><ChevronRight size={20} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2 border-b border-slate-100 pb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {renderCalendar()}
          </div>
        </div>
      )}
    </div>
  );
};