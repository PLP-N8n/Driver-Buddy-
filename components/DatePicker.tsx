import React from 'react';
import { CalendarDays } from 'lucide-react';
import { fieldLabelClasses, inputClasses } from '../utils/ui';

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ id, value, onChange, label, className }) => (
  <div className={`block ${className ?? ''}`}>
    {label && (
      <label htmlFor={id} className={fieldLabelClasses}>
        {label}
      </label>
    )}
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`pl-10 ${inputClasses}`}
      />
    </div>
  </div>
);
