import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, Lightbulb, MessageSquare, Wrench, X } from 'lucide-react';
import { submitFeedback, FeedbackType } from '../services/feedbackService';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  fieldErrorClasses,
  fieldLabelClasses,
  inputClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
} from '../utils/ui';

interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage?: string;
}

const types: Array<{ value: FeedbackType; label: string; icon: typeof Wrench }> = [
  { value: 'bug', label: 'Bug', icon: Wrench },
  { value: 'suggestion', label: 'Suggestion', icon: Lightbulb },
  { value: 'other', label: 'Other', icon: MessageSquare },
];

export const FeedbackSheet: React.FC<FeedbackSheetProps> = ({ isOpen, onClose, currentPage }) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const [type, setType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  useFocusTrap(sheetRef, isOpen, onClose);

  const clearStatusTimer = () => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  };

  useEffect(() => clearStatusTimer, []);

  useEffect(() => {
    if (!isOpen) {
      clearStatusTimer();
      setStatus('idle');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;

    setStatus('sending');
    try {
      await submitFeedback(type, message.trim(), currentPage);
      setStatus('done');
      setMessage('');
      clearStatusTimer();
      statusTimerRef.current = window.setTimeout(() => {
        setStatus('idle');
        statusTimerRef.current = null;
        onClose();
      }, 1800);
    } catch {
      setStatus('error');
      clearStatusTimer();
      statusTimerRef.current = window.setTimeout(() => {
        setStatus('idle');
        statusTimerRef.current = null;
      }, 3000);
    }
  };

  return (
    <div className={sheetBackdropClasses} onClick={onClose}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        className={sheetPanelClasses}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />

        {status === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-400" />
            <p className="font-semibold text-white">Thanks for the feedback</p>
            <p className="text-sm text-slate-400">It has been queued for review.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-brand" />
                <h3 className="text-lg font-semibold text-white">Send Feedback</h3>
              </div>
              <button type="button" onClick={onClose} className={secondaryButtonClasses} aria-label="Close feedback form">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {types.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all ${
                      type === value
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-surface-border bg-surface-raised text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="feedback-message" className={fieldLabelClasses}>
                  {type === 'bug' ? 'What went wrong?' : type === 'suggestion' ? 'What would you improve?' : 'Your message'}
                </label>
                <textarea
                  id="feedback-message"
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={
                    type === 'bug'
                      ? 'Example: the save button on Work Log is not visible.'
                      : type === 'suggestion'
                        ? 'Example: it would help to export a PDF summary.'
                        : 'Tell us anything useful.'
                  }
                  className={`${inputClasses} min-h-28 resize-none text-sm`}
                />
              </div>

              {status === 'error' && (
                <p className={fieldErrorClasses}>Couldn't save - tap to try again</p>
              )}

              <button
                type="submit"
                disabled={!message.trim() || status === 'sending'}
                className={`${primaryButtonClasses} w-full`}
              >
                {status === 'sending' ? 'Sending...' : 'Send Feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
