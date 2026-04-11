import React from 'react';
import { AlertCircle, BookOpen, CheckCircle } from 'lucide-react';
import { getCurrentTaxYearLabel } from '../types';
import { formatCurrency, panelClasses, subtlePanelClasses } from '../utils/ui';

const TAX_YEAR_LABEL = getCurrentTaxYearLabel();

const taxTips = [
  'Keep a mileage log for every business journey with the date, route, purpose, and miles driven.',
  'If you use the mileage method for a vehicle, the mileage rate already covers fuel, repairs, insurance, and road tax.',
  'Track personal and business mileage separately so your business-use percentage stays defensible.',
  'Download courier or platform statements regularly and keep copies with your records.',
  "Set aside part of each week's profit for your January bill and possible payments on account.",
  'Keep receipts for parking, tolls, phone, uniforms, and other non-mileage business costs.',
  `Register for Self Assessment if your self-employed income goes over ${formatCurrency(1000)} in the tax year.`,
  `If your tax bill is more than ${formatCurrency(1000)}, HMRC may ask for payments on account toward the next year.`,
];

const quickReference = [
  { label: 'Mileage rate, first 10,000 business miles', value: '45p per mile' },
  { label: 'Mileage rate, over 10,000 business miles', value: '25p per mile' },
  { label: `Personal Allowance ${TAX_YEAR_LABEL}`, value: formatCurrency(12570) },
  { label: 'Class 4 NIC main band', value: `6% from ${formatCurrency(12570)} to ${formatCurrency(50270)}` },
];

export const TaxAssistant: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className={`${panelClasses} p-5`}>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <BookOpen className="h-5 w-5 text-brand" />
          Tax reference
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {quickReference.map((item) => (
            <div key={item.label} className={`${subtlePanelClasses} p-4`}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="text-sm font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-200">
          <AlertCircle className="h-4 w-4" />
          Practical reminders
        </h3>
        <ul className="space-y-3">
          {taxTips.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-sm text-amber-100">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
