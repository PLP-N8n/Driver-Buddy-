import React from 'react';
import { AlertCircle, Cloud, CloudOff, Loader2 } from 'lucide-react';
import type { ReceiptUploadStatus } from '../services/uploadStatusStore';

type ReceiptStatusBadgeProps = {
  status: Exclude<ReceiptUploadStatus, 'pending'>;
};

const config = {
  uploading: {
    icon: Loader2,
    label: 'Uploading',
    className: 'bg-slate-700/40 text-slate-300',
    iconClassName: 'animate-spin',
  },
  synced: {
    icon: Cloud,
    label: 'Cloud synced',
    className: 'bg-emerald-500/15 text-emerald-300',
    iconClassName: '',
  },
  failed: {
    icon: AlertCircle,
    label: 'Upload failed',
    className: 'bg-red-500/15 text-red-300',
    iconClassName: '',
  },
  'local-only': {
    icon: CloudOff,
    label: 'Local only',
    className: 'bg-amber-500/15 text-amber-300',
    iconClassName: '',
  },
} satisfies Record<ReceiptStatusBadgeProps['status'], { icon: typeof Cloud; label: string; className: string; iconClassName: string }>;

export const ReceiptStatusBadge: React.FC<ReceiptStatusBadgeProps> = ({ status }) => {
  const item = config[status];
  const Icon = item.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${item.className}`}>
      <Icon className={`h-3 w-3 ${item.iconClassName}`} />
      {item.label}
    </span>
  );
};
