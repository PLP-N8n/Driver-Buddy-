import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { primaryButtonClasses, secondaryButtonClasses } from '../utils/ui';

export interface ReceiptCameraProps {
  onCapture: (file: File, extracted?: { amount?: number; date?: string; merchant?: string }) => void;
  onCancel: () => void;
}

export const ReceiptCamera: React.FC<ReceiptCameraProps> = ({ onCapture, onCancel }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleConfirm = () => {
    if (!file) return;
    // Lightweight extraction: try to find amount in filename
    const amountMatch = file.name.match(/(\d+[.,]\d{2})/);
    const amount = amountMatch?.[1] ? Number.parseFloat(amountMatch[1].replace(',', '.')) : undefined;
    onCapture(file, { amount });
  };

  const handleRetake = () => {
    setPreview(null);
    setFile(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-border bg-surface-raised p-6">
      {!preview ? (
        <>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-surface-border p-8 transition-colors hover:border-brand">
            <Camera className="h-8 w-8 text-slate-400" />
            <span className="text-sm text-slate-400">Take photo or upload</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} className="sr-only" aria-label="Take photo" />
          </label>
          <button type="button" onClick={onCancel} className={secondaryButtonClasses}>Cancel</button>
        </>
      ) : (
        <>
          <img src={preview} alt="Receipt preview" className="max-h-64 rounded-xl object-contain" />
          <div className="flex gap-3">
            <button type="button" onClick={handleRetake} className={secondaryButtonClasses}>Retake</button>
            <button type="button" onClick={handleConfirm} className={primaryButtonClasses}>Use this</button>
          </div>
        </>
      )}
    </div>
  );
};
