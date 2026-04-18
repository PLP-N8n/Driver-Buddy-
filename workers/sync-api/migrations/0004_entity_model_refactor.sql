-- Task 14: Entity model refactor schema
-- Adds shifts and shift_earnings tables.
-- Adds HMRC classification columns to expenses.
-- Does NOT drop work_logs or mileage_logs (kept for rollback).

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  primary_platform TEXT,
  hours_worked REAL,
  total_earnings REAL NOT NULL DEFAULT 0,
  started_at TEXT,
  ended_at TEXT,
  start_odometer REAL,
  end_odometer REAL,
  business_miles REAL,
  personal_gap_miles REAL,
  gps_miles REAL,
  mileage_source TEXT,
  start_lat REAL,
  start_lng REAL,
  end_lat REAL,
  end_lng REAL,
  fuel_liters REAL,
  job_count INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shift_earnings (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  amount REAL NOT NULL,
  job_count INTEGER,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'business';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_use_percent REAL NOT NULL DEFAULT 100;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deductible_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS non_deductible_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vehicle_expense_type TEXT NOT NULL DEFAULT 'non_vehicle';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_treatment TEXT NOT NULL DEFAULT 'deductible';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS linked_shift_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'confirmed';
