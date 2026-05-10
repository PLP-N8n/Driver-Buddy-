import React, { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { primaryButtonClasses, secondaryButtonClasses } from '../utils/ui';

export interface ReceiptCameraProps {
  onCapture: (file: File, extracted?: { amount?: number; date?: string; merchant?: string }) => void;
  onCancel: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export const ReceiptCamera: React.FC<ReceiptCameraProps> = ({ onCapture, onCancel }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);

    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
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
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setError(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-border bg-surface-raised p-6">
      {!preview ? (
        <>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-surface-border p-8 transition-colors hover:border-brand">
            <Camera className="h-8 w-8 text-slate-400" />
            <span className="text-sm text-slate-400">Take photo or upload</span>
            {error && <span className="text-xs text-red-400">{error}</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={handleFile} className="sr-only" aria-label="Take photo" />
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
