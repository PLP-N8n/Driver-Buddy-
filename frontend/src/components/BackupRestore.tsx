import React, { useState, useRef } from 'react';
import { Trip, Expense, DailyWorkLog, Settings, PlayerStats, RecurringExpense } from '../types';
import { Download, Upload, ShieldCheck, AlertCircle, CheckCircle, Lock, Unlock, X, HardDrive, Clock, FileWarning, Loader2 } from 'lucide-react';

interface BackupRestoreProps {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  playerStats: PlayerStats;
  recurringExpenses?: RecurringExpense[];
  onRestore: (data: {
    trips: Trip[];
    expenses: Expense[];
    dailyLogs: DailyWorkLog[];
    settings: Settings;
    playerStats: PlayerStats;
    recurringExpenses?: RecurringExpense[];
  }) => void;
  lastBackupDate: string | null;
  entriesSinceBackup: number;
}

const BACKUP_VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// --- Crypto helpers (AES-256-GCM) ---
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  // Pack: salt + iv + cipher as base64
  const packed = new Uint8Array(salt.length + iv.length + cipherBuffer.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(cipherBuffer), salt.length + iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function decryptData(encoded: string, password: string): Promise<string> {
  const packed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const salt = packed.slice(0, SALT_LENGTH);
  const iv = packed.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = packed.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveKey(password, salt);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuffer);
}

export const BackupRestore: React.FC<BackupRestoreProps> = ({
  trips, expenses, dailyLogs, settings, playerStats, recurringExpenses,
  onRestore, lastBackupDate, entriesSinceBackup
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'loading'; msg: string } | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalEntries = trips.length + expenses.length + dailyLogs.length;
  const needsBackup = entriesSinceBackup >= 10;

  const handleExport = async () => {
    if (password.length < 4) {
      setStatus({ type: 'error', msg: 'Password must be at least 4 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setStatus({ type: 'error', msg: 'Passwords do not match.' });
      return;
    }

    setStatus({ type: 'loading', msg: 'Encrypting backup...' });

    try {
      const payload = JSON.stringify({
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: { trips, expenses, dailyLogs, settings, playerStats }
      });

      const encrypted = await encryptData(payload, password);

      const blob = new Blob([JSON.stringify({ dtpBackup: true, v: BACKUP_VERSION, payload: encrypted })], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DriverTaxPro_Backup_${new Date().toISOString().split('T')[0]}.dtpbak`;
      a.click();
      URL.revokeObjectURL(url);

      // Update backup tracking
      localStorage.setItem('driver_last_backup', new Date().toISOString());
      localStorage.setItem('driver_entries_since_backup', '0');

      setStatus({ type: 'success', msg: 'Backup exported and encrypted successfully!' });
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowExport(false);
        setStatus(null);
      }, 2000);
    } catch (err) {
      setStatus({ type: 'error', msg: 'Encryption failed. Please try again.' });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.dtpBackup) {
          setStatus({ type: 'error', msg: 'Invalid backup file. Not a DriverTax Pro backup.' });
          return;
        }
        setPreviewData(parsed);
        setStatus(null);
      } catch {
        setStatus({ type: 'error', msg: 'Could not read file. Is it a valid .dtpbak file?' });
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!previewData || !restorePassword) {
      setStatus({ type: 'error', msg: 'Please select a file and enter your password.' });
      return;
    }

    setStatus({ type: 'loading', msg: 'Decrypting backup...' });

    try {
      const decrypted = await decryptData(previewData.payload, restorePassword);
      const parsed = JSON.parse(decrypted);

      if (!parsed.data || !parsed.data.trips || !parsed.data.expenses) {
        setStatus({ type: 'error', msg: 'Backup file is corrupted or incomplete.' });
        return;
      }

      onRestore(parsed.data);

      setStatus({ type: 'success', msg: `Restored ${parsed.data.trips.length} trips, ${parsed.data.expenses.length} expenses, ${parsed.data.dailyLogs.length} work logs.` });
      setPreviewData(null);
      setRestorePassword('');
      setTimeout(() => {
        setShowImport(false);
        setStatus(null);
      }, 3000);
    } catch {
      setStatus({ type: 'error', msg: 'Wrong password or corrupted file.' });
    }
  };

  return (
    <div className="space-y-6" data-testid="backup-restore-section">
      {/* Backup Reminder Banner */}
      {needsBackup && (
        <div data-testid="backup-reminder-banner" className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="bg-amber-100 p-2 rounded-full shrink-0">
            <FileWarning className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-900">Backup Recommended</h4>
            <p className="text-xs text-amber-700 mt-1">
              You've added <span className="font-bold">{entriesSinceBackup} entries</span> since your last backup.
              {lastBackupDate
                ? ` Last backup: ${new Date(lastBackupDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
                : ' You have never created a backup.'}
            </p>
          </div>
          <button
            data-testid="backup-reminder-action-btn"
            onClick={() => setShowExport(true)}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
          >
            Backup Now
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-blue-500" /> Data Backup & Restore
        </h4>
        <p className="text-xs text-slate-500 mb-5">
          Your data is stored in this browser only. Export an encrypted backup to protect against data loss.
        </p>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white p-3 rounded-xl border border-slate-100 text-center">
            <p className="text-2xl font-black text-slate-800">{totalEntries}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Total Records</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-100 text-center">
            <p className="text-2xl font-black text-slate-800">{entriesSinceBackup}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Since Backup</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-100 text-center">
            <p className="text-sm font-bold text-slate-600 mt-1">
              {lastBackupDate
                ? new Date(lastBackupDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                : 'Never'}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Last Backup</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            data-testid="export-backup-btn"
            onClick={() => { setShowExport(true); setShowImport(false); setStatus(null); }}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all active:scale-[0.98]"
          >
            <Download size={18} /> Export Backup
          </button>
          <button
            data-testid="import-backup-btn"
            onClick={() => { setShowImport(true); setShowExport(false); setStatus(null); setPreviewData(null); }}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl border border-slate-200 shadow-sm transition-all active:scale-[0.98]"
          >
            <Upload size={18} /> Restore Backup
          </button>
        </div>
      </div>

      {/* Export Panel */}
      {showExport && (
        <div data-testid="export-panel" className="bg-white p-6 rounded-2xl border border-blue-100 shadow-lg animate-in fade-in slide-in-from-top-2 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-2xl" />
          <button onClick={() => { setShowExport(false); setStatus(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>

          <h4 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
            <Lock className="text-blue-500" size={20} /> Create Encrypted Backup
          </h4>
          <p className="text-xs text-slate-500 mb-5">Set a password to encrypt your backup. You'll need this password to restore.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Encryption Password</label>
              <input
                data-testid="export-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 4 characters"
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm Password</label>
              <input
                data-testid="export-confirm-password-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* What's included */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600">
              <p className="font-bold mb-1">Backup includes:</p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">{trips.length} Trips</span>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">{expenses.length} Expenses</span>
                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">{dailyLogs.length} Work Logs</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">Settings</span>
                <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded font-bold">Player Stats</span>
              </div>
            </div>

            {status && (
              <div data-testid="export-status" className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
                'bg-blue-50 text-blue-700 border border-blue-100'
              }`}>
                {status.type === 'success' && <CheckCircle size={16} />}
                {status.type === 'error' && <AlertCircle size={16} />}
                {status.type === 'loading' && <Loader2 size={16} className="animate-spin" />}
                {status.msg}
              </div>
            )}

            <button
              data-testid="export-confirm-btn"
              onClick={handleExport}
              disabled={status?.type === 'loading'}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {status?.type === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {status?.type === 'loading' ? 'Encrypting...' : 'Encrypt & Download'}
            </button>
          </div>
        </div>
      )}

      {/* Import Panel */}
      {showImport && (
        <div data-testid="import-panel" className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-lg animate-in fade-in slide-in-from-top-2 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-2xl" />
          <button onClick={() => { setShowImport(false); setStatus(null); setPreviewData(null); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>

          <h4 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
            <Unlock className="text-emerald-500" size={20} /> Restore from Backup
          </h4>
          <p className="text-xs text-slate-500 mb-5">Select your .dtpbak file and enter the password used during export.</p>

          <div className="space-y-4">
            {/* File Select */}
            <div>
              <input ref={fileInputRef} type="file" accept=".dtpbak,.json" onChange={handleFileSelect} className="hidden" />
              <button
                data-testid="select-backup-file-btn"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-4 border-2 border-dashed rounded-xl text-center transition-all ${
                  previewData ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50'
                }`}
              >
                {previewData ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-700 font-bold text-sm">
                    <CheckCircle size={18} /> Backup file loaded (v{previewData.v})
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-slate-500">
                    <Upload size={24} className="mb-1" />
                    <span className="text-sm font-bold">Select .dtpbak file</span>
                  </div>
                )}
              </button>
            </div>

            {/* Password */}
            {previewData && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Decryption Password</label>
                  <input
                    data-testid="restore-password-input"
                    type="password"
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    placeholder="Enter backup password"
                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-start gap-2">
                  <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={16} />
                  <p className="text-xs text-orange-800">
                    <span className="font-bold">Warning:</span> Restoring will replace all current data. Make sure you've backed up first.
                  </p>
                </div>
              </>
            )}

            {status && (
              <div data-testid="import-status" className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
                'bg-blue-50 text-blue-700 border border-blue-100'
              }`}>
                {status.type === 'success' && <CheckCircle size={16} />}
                {status.type === 'error' && <AlertCircle size={16} />}
                {status.type === 'loading' && <Loader2 size={16} className="animate-spin" />}
                {status.msg}
              </div>
            )}

            {previewData && (
              <button
                data-testid="restore-confirm-btn"
                onClick={handleRestore}
                disabled={!restorePassword || status?.type === 'loading'}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {status?.type === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                {status?.type === 'loading' ? 'Decrypting...' : 'Restore Data'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
