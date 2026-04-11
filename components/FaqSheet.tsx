import React, { useRef, useState } from 'react';
import { ChevronDown, HelpCircle, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { secondaryButtonClasses, sheetBackdropClasses, sheetPanelClasses } from '../utils/ui';

interface FaqSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const sections = [
  {
    title: 'Privacy & Data',
    items: [
      {
        q: 'Who can see my information?',
        a: 'Nobody but you. Data is stored on your device. If cloud sync is enabled, it is stored against a random code with no name, email, or login attached.',
      },
      {
        q: 'Do I need to create an account?',
        a: 'No. No signup or password is required. Open the app and start logging immediately.',
      },
      {
        q: 'What happens if I lose my phone?',
        a: 'Save your backup code in Settings. Enter that code on a new device to restore your records.',
      },
    ],
  },
  {
    title: 'Tax & Money',
    items: [
      {
        q: 'Is this proper tax advice?',
        a: 'No. It is a running estimate based on HMRC rates. Use an accountant or HMRC directly for final filing decisions.',
      },
      {
        q: 'What tax rates does it use?',
        a: 'Current HMRC mileage rates plus current personal allowance and Class 4 NI thresholds for the supported tax year.',
      },
      {
        q: 'Does it file my tax return for me?',
        a: 'Not yet. It prepares and organizes the numbers so filing is easier.',
      },
      {
        q: 'What is the difference between Simplified and Actual method?',
        a: 'Simplified uses HMRC mileage rates. Actual costs use your real vehicle expenses multiplied by business-use percentage.',
      },
    ],
  },
  {
    title: 'Using the App',
    items: [
      {
        q: 'Does it work on my phone?',
        a: 'Yes. It is built mobile-first and runs in the browser like an app.',
      },
      {
        q: 'Which platforms does it support?',
        a: 'Uber, Bolt, Amazon Flex, Deliveroo, Uber Eats, DPD, Evri, and other self-employed driving work.',
      },
      {
        q: 'Do I need to log every single trip?',
        a: 'The more you log, the more accurate the estimate. Even rough shift-level logging is better than nothing.',
      },
      {
        q: 'Can I use it for more than one vehicle?',
        a: 'You can update the vehicle registration in Settings whenever needed.',
      },
    ],
  },
  {
    title: 'Cost',
    items: [
      {
        q: 'Is it free?',
        a: 'The current beta is free while the product is being refined using real driver feedback.',
      },
      {
        q: 'Will it always be free?',
        a: 'Core tracking is expected to stay free. Some advanced features may become paid later.',
      },
    ],
  },
];

export const FaqSheet: React.FC<FaqSheetProps> = ({ isOpen, onClose }) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  useFocusTrap(sheetRef, isOpen, onClose);

  if (!isOpen) return null;

  const toggle = (key: string) => setOpenItem((current) => (current === key ? null : key));

  return (
    <div className={sheetBackdropClasses} onClick={onClose}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Frequently asked questions"
        className={sheetPanelClasses}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />

        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-white">Frequently Asked Questions</h2>
          </div>
          <button type="button" onClick={onClose} className={secondaryButtonClasses} aria-label="Close frequently asked questions">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 pb-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
              <div className="overflow-hidden rounded-2xl border border-surface-border">
                {section.items.map((item, index) => {
                  const key = `${section.title}-${index}`;
                  const isExpanded = openItem === key;

                  return (
                    <div key={key} className={index > 0 ? 'border-t border-surface-border' : ''}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggle(key)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-raised"
                      >
                        <span className="text-sm font-medium text-white">{item.q}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="border-t border-surface-border bg-surface-raised px-4 py-3">
                          <p className="text-sm leading-relaxed text-slate-300">{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
