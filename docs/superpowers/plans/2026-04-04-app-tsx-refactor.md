# App.tsx Refactor — Extract Custom Hooks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce App.tsx from 1,428 lines to ~1,100 by extracting three self-contained custom hooks, without breaking any existing behaviour.

**Architecture:** One hook per extraction. Each hook owns its own state and effects, returns only what App.tsx needs, and is typed precisely. App.tsx replaces moved code with a single hook call. Each extraction ends with typecheck + build passing and a deploy.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Pages (`npx wrangler pages deploy dist --project-name drivertax --branch main`)

**Rules:**
- After EVERY task: `npm run typecheck` then `npm run build` MUST pass before moving on
- Do NOT change any behaviour — this is a pure refactor
- Do NOT rename any exported symbols used outside the file being extracted
- Do NOT extract state that is read by JSX in App.tsx — only move it if the hook can own it fully

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `hooks/useConnectivity.ts` | **Create** | isOnline state + connectivityBanner state + event listeners |
| `hooks/useBackupRestore.ts` | **Create** | backupCode state + restoreStatusMessage state + all 4 handlers |
| `hooks/useExport.ts` | **Create** | exportConfig state + handleExport |
| `App.tsx` | **Modify** | Remove extracted code, add hook calls |

---

## Task 1: Extract `useConnectivity`

**Files:**
- Create: `hooks/useConnectivity.ts`
- Modify: `App.tsx`

This hook owns `isOnline` and `connectivityBanner`. It has zero external dependencies — no props, no callbacks needed.

- [ ] **Step 1: Create `hooks/useConnectivity.ts`**

```typescript
import { useEffect, useState } from 'react';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [connectivityBanner, setConnectivityBanner] = useState<'offline' | 'online' | null>(
    navigator.onLine ? null : 'offline'
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setConnectivityBanner('offline');
      return;
    }

    setConnectivityBanner((current) => (current === 'offline' ? 'online' : current));
    const timer = window.setTimeout(() => {
      setConnectivityBanner((current) => (current === 'online' ? null : current));
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [isOnline]);

  return { isOnline, connectivityBanner };
}
```

- [ ] **Step 2: Update `App.tsx` — remove the two state declarations**

Find and remove these two lines from the useState block (around line 427-428):
```typescript
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [connectivityBanner, setConnectivityBanner] = useState<'offline' | 'online' | null>(navigator.onLine ? null : 'offline');
```

- [ ] **Step 3: Update `App.tsx` — remove the two effects**

Find and remove the online/offline event listener effect (around line 488-511):
```typescript
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  useEffect(() => {
    if (!isOnline) {
      setConnectivityBanner('offline');
      return;
    }

    setConnectivityBanner((current) => (current === 'offline' ? 'online' : current));
    const timer = window.setTimeout(() => {
      setConnectivityBanner((current) => (current === 'online' ? null : current));
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [isOnline]);
```

- [ ] **Step 4: Update `App.tsx` — add hook call**

Add the import at the top of App.tsx with the other hook imports:
```typescript
import { useConnectivity } from './hooks/useConnectivity';
```

Add the hook call at the top of the `App()` function, after the existing `useRef` calls:
```typescript
  const { isOnline, connectivityBanner } = useConnectivity();
```

- [ ] **Step 5: Verify**

```bash
cd C:/Projects/ventures/Driver-Buddy && npm run typecheck && npm run build
```

Expected: typecheck passes, build passes with `Build verification passed.`

- [ ] **Step 6: Deploy**

```bash
cd C:/Projects/ventures/Driver-Buddy && npx wrangler pages deploy dist --project-name drivertax --branch main
```

Expected: `Deployment complete!`

---

## Task 2: Extract `useBackupRestore`

**Files:**
- Create: `hooks/useBackupRestore.ts`
- Modify: `App.tsx`

This hook owns `backupCode` and `restoreStatusMessage`. It receives read-only data snapshots and setters for the data it mutates on restore.

- [ ] **Step 1: Create `hooks/useBackupRestore.ts`**

```typescript
import React, { useState } from 'react';
import { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { PlayerStats } from '../types';
import { getBackupCode, restoreFromBackupCode } from '../services/deviceId';
import { pull } from '../services/syncService';
import { isSyncConfigured } from '../services/syncService';
import { prepareExpensesForLocalState } from '../App';
import { normalizeSettings, applyPulledTrips, applyPulledExpenses, applyPulledWorkLogs } from '../App';
import { SyncPullPayload } from '../types';
import * as Sentry from '../src/sentry';

type ShowToast = (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;

interface UseBackupRestoreParams {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  playerStats: PlayerStats;
  showToast: ShowToast;
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setDailyLogs: React.Dispatch<React.SetStateAction<DailyWorkLog[]>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setPlayerStats: React.Dispatch<React.SetStateAction<PlayerStats>>;
  triggerTextDownload: (filename: string, content: string, mimeType: string) => void;
  queueDownload: (count: number, fn: () => void) => void;
}

export function useBackupRestore({
  trips,
  expenses,
  dailyLogs,
  settings,
  playerStats,
  showToast,
  setTrips,
  setExpenses,
  setDailyLogs,
  setSettings,
  setPlayerStats,
  triggerTextDownload,
  queueDownload,
}: UseBackupRestoreParams) {
  const [backupCode, setBackupCode] = useState(() => getBackupCode());
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null);

  const handleBackup = () => {
    const data = { trips, expenses, dailyLogs, settings, playerStats, version: '1.0', exportDate: new Date().toISOString() };
    queueDownload(trips.length + expenses.length + dailyLogs.length, () => {
      triggerTextDownload(
        `DriverTaxPro_Backup_${new Date().toISOString().split('T')[0]}.json`,
        JSON.stringify(data, null, 2),
        'application/json'
      );
    });
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const data = JSON.parse(loadEvent.target?.result as string);
        if (Array.isArray(data.trips)) setTrips(data.trips);
        if (Array.isArray(data.expenses)) {
          const preparedExpenses = await prepareExpensesForLocalState(data.expenses);
          setExpenses(preparedExpenses);
        }
        if (Array.isArray(data.dailyLogs)) setDailyLogs(data.dailyLogs);
        if (data.settings) setSettings(normalizeSettings(data.settings));
        if (data.playerStats) setPlayerStats(data.playerStats);
        const restoredLogs = Array.isArray(data.dailyLogs) ? data.dailyLogs.length : 0;
        const restoredExpenses = Array.isArray(data.expenses) ? data.expenses.length : 0;
        const message = `${restoredLogs} work logs and ${restoredExpenses} expenses restored successfully`;
        setRestoreStatusMessage(message);
        showToast(message);
      } catch (error) {
        Sentry.captureException(error);
        console.error('Failed to restore data', error);
        showToast('Invalid backup file. Choose a valid Driver Buddy backup.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleCopyBackupCode = async () => {
    try {
      await navigator.clipboard.writeText(backupCode);
      showToast('Backup code copied.');
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to copy backup code', error);
      alert('Could not copy the backup code. Copy it manually from the code box.');
    }
  };

  const handleRestoreFromBackupCode = async (code: string) => {
    const trimmedCode = code.trim();

    if (!restoreFromBackupCode(trimmedCode)) {
      showToast('Enter a valid backup code.', 'warning');
      return;
    }

    setBackupCode(getBackupCode());

    const syncedData = (await pull()) as SyncPullPayload | null;
    if (!syncedData) {
      showToast(
        isSyncConfigured()
          ? 'Backup code saved, but cloud data could not be pulled right now.'
          : 'Backup code saved. Set VITE_SYNC_WORKER_URL before using cloud restore.',
        'warning'
      );
      return;
    }

    setTrips(applyPulledTrips(syncedData.mileageLogs ?? []));
    setDailyLogs(applyPulledWorkLogs(syncedData.workLogs ?? []));
    setExpenses(applyPulledExpenses(syncedData.expenses ?? []));
    if (syncedData.settings) setSettings(normalizeSettings(syncedData.settings));
    const restoredLogs = syncedData.workLogs?.length ?? 0;
    const restoredExpenses = syncedData.expenses?.length ?? 0;
    const message = `${restoredLogs} work logs and ${restoredExpenses} expenses restored successfully`;
    setRestoreStatusMessage(message);
    showToast(message);
  };

  return {
    backupCode,
    setBackupCode,
    restoreStatusMessage,
    handleBackup,
    handleRestore,
    handleCopyBackupCode,
    handleRestoreFromBackupCode,
  };
}
```

**IMPORTANT:** The imports above reference `prepareExpensesForLocalState`, `normalizeSettings`, `applyPulledTrips`, `applyPulledExpenses`, `applyPulledWorkLogs` from `'../App'`. Before writing this file, check if these are already exported from App.tsx. If not, add `export` keyword to each one in App.tsx first.

- [ ] **Step 2: Export helpers from `App.tsx`**

Check App.tsx for these functions and add `export` if missing:
```
normalizeSettings (line ~129)
prepareExpensesForLocalState (line ~205)
applyPulledTrips (line ~280)
applyPulledWorkLogs (line ~300)
applyPulledExpenses (line ~320)
```

- [ ] **Step 3: Update `App.tsx` — replace state + handlers with hook call**

Remove from App.tsx:
- `const [backupCode, setBackupCode] = useState('');` (line ~414)
- `const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null);` (line ~430)
- `const handleBackup = () => { ... }` (lines ~971-980)
- `const handleRestore = ...` (lines ~982-1010)
- `const handleCopyBackupCode = ...` (lines ~1012-1021)
- `const handleRestoreFromBackupCode = ...` (lines ~1023-1053)

Add import:
```typescript
import { useBackupRestore } from './hooks/useBackupRestore';
```

Add hook call after `useConnectivity`:
```typescript
  const {
    backupCode,
    setBackupCode,
    restoreStatusMessage,
    handleBackup,
    handleRestore,
    handleCopyBackupCode,
    handleRestoreFromBackupCode,
  } = useBackupRestore({
    trips,
    expenses,
    dailyLogs,
    settings,
    playerStats,
    showToast,
    setTrips,
    setExpenses,
    setDailyLogs,
    setSettings,
    setPlayerStats,
    triggerTextDownload,
    queueDownload,
  });
```

- [ ] **Step 4: Verify**

```bash
cd C:/Projects/ventures/Driver-Buddy && npm run typecheck && npm run build
```

Expected: typecheck passes, build passes.

- [ ] **Step 5: Deploy**

```bash
cd C:/Projects/ventures/Driver-Buddy && npx wrangler pages deploy dist --project-name drivertax --branch main
```

---

## Task 3: Extract `useExport`

**Files:**
- Create: `hooks/useExport.ts`
- Modify: `App.tsx`

This hook owns `exportConfig` and `handleExport`. It needs the data arrays and helper functions.

- [ ] **Step 1: Check what `handleExport` uses**

Before writing, verify these helpers are accessible from App.tsx around line 178-183:
- `escapeCsvCell`
- `triggerTextDownload`
- `queueDownload`

These need to be exported from App.tsx or passed as params.

- [ ] **Step 2: Create `hooks/useExport.ts`**

Read the full `handleExport` function from App.tsx (lines ~1055-1100) and move it verbatim into this hook:

```typescript
import { useState } from 'react';
import { DailyWorkLog, Expense, Trip } from '../types';
import { escapeCsvCell } from '../App';

interface ExportConfig {
  includeTrips: boolean;
  includeExpenses: boolean;
  includeWorkLogs: boolean;
}

interface UseExportParams {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  triggerTextDownload: (filename: string, content: string, mimeType: string) => void;
  queueDownload: (count: number, fn: () => void) => void;
}

export function useExport({ trips, expenses, dailyLogs, triggerTextDownload, queueDownload }: UseExportParams) {
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    includeTrips: true,
    includeExpenses: true,
    includeWorkLogs: true,
  });

  const handleExport = () => {
    // Copy the full handleExport body verbatim from App.tsx lines ~1055-1100
    // Do not paraphrase — copy exactly as-is
  };

  return { exportConfig, setExportConfig, handleExport };
}
```

**IMPORTANT:** The comment `// Copy the full handleExport body verbatim` is a placeholder — read the actual function from App.tsx and paste it in. Do not guess.

- [ ] **Step 3: Export `escapeCsvCell` from `App.tsx`**

Add `export` to `escapeCsvCell` at line ~178 in App.tsx:
```typescript
export const escapeCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
```

- [ ] **Step 4: Update `App.tsx` — replace with hook call**

Remove from App.tsx:
- `const [exportConfig, setExportConfig] = useState(...)` (line ~421)
- `const handleExport = () => { ... }` (lines ~1055-1100)

Add import:
```typescript
import { useExport } from './hooks/useExport';
```

Add hook call:
```typescript
  const { exportConfig, setExportConfig, handleExport } = useExport({
    trips,
    expenses,
    dailyLogs,
    triggerTextDownload,
    queueDownload,
  });
```

- [ ] **Step 5: Verify**

```bash
cd C:/Projects/ventures/Driver-Buddy && npm run typecheck && npm run build
```

Expected: typecheck passes, build passes.

- [ ] **Step 6: Deploy**

```bash
cd C:/Projects/ventures/Driver-Buddy && npx wrangler pages deploy dist --project-name drivertax --branch main
```

---

## Stop Condition

After Task 3 completes and deploys successfully, stop. Do not proceed to extract `useAppStorage` or `useSync` — those are riskier and need a separate planning session.

The goal for this plan is: typecheck passes, build passes, deploy succeeds, and App.tsx is ~200 lines shorter with no behaviour changes.

---

## Verification Checklist (run after all 3 tasks)

- [ ] `npm run typecheck` — no errors
- [ ] `npm run build` — bundle size within 5KB of original (663KB)
- [ ] `https://drivertax.rudradigital.uk` loads
- [ ] `curl -sI https://drivertax.rudradigital.uk | grep content-security` shows correct CSP
- [ ] App.tsx line count is under 1,250 (`wc -l App.tsx`)
