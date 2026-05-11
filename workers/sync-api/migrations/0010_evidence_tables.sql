-- Evidence tables for Ledger vs. Evidence storage model.
-- Stores incoming observations from manual, OCR, and API sources.

CREATE TABLE IF NOT EXISTS shift_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'ocr', 'api')),
  source_detail TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  platform TEXT,
  hours_worked REAL,
  earnings REAL,
  started_at TEXT,
  ended_at TEXT,
  start_odometer REAL,
  end_odometer REAL,
  business_miles REAL,
  fuel_liters REAL,
  job_count INTEGER,
  notes TEXT,
  provider_splits TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_to_ledger_id TEXT,
  dispute_status TEXT
);

CREATE TABLE IF NOT EXISTS expense_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'ocr', 'api')),
  source_detail TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  category TEXT,
  amount REAL,
  description TEXT,
  receipt_id TEXT,
  scope TEXT,
  business_use_percent REAL,
  vehicle_expense_type TEXT,
  tax_treatment TEXT,
  linked_shift_id TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_to_ledger_id TEXT,
  dispute_status TEXT
);

CREATE TABLE IF NOT EXISTS mileage_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'ocr', 'api')),
  source_detail TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  start_location TEXT,
  end_location TEXT,
  start_odometer REAL,
  end_odometer REAL,
  total_miles REAL,
  purpose TEXT,
  path TEXT,
  notes TEXT,
  linked_shift_id TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_to_ledger_id TEXT,
  dispute_status TEXT
);

-- Add ledger metadata columns to existing tables
ALTER TABLE shifts ADD COLUMN resolved_from_evidence TEXT NOT NULL DEFAULT '[]';
ALTER TABLE shifts ADD COLUMN last_resolved_at TEXT;
ALTER TABLE shifts ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;

ALTER TABLE expenses ADD COLUMN resolved_from_evidence TEXT NOT NULL DEFAULT '[]';
ALTER TABLE expenses ADD COLUMN last_resolved_at TEXT;
ALTER TABLE expenses ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;

ALTER TABLE mileage_logs ADD COLUMN resolved_from_evidence TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mileage_logs ADD COLUMN last_resolved_at TEXT;
ALTER TABLE mileage_logs ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;
