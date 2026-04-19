-- Baseline schema for core sync tables.
-- Uses CREATE TABLE IF NOT EXISTS - safe to apply to existing databases.

CREATE TABLE IF NOT EXISTS users (
  device_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_sync INTEGER
);

CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  platform TEXT,
  hours REAL,
  earnings REAL,
  notes TEXT,
  updated_at INTEGER,
  PRIMARY KEY (id, device_id)
);

CREATE TABLE IF NOT EXISTS mileage_logs (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  miles REAL,
  trip_type TEXT,
  linked_work_id TEXT,
  updated_at INTEGER,
  PRIMARY KEY (id, device_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT,
  description TEXT,
  amount REAL,
  tax_deductible INTEGER DEFAULT 1,
  has_image INTEGER DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (id, device_id)
);

CREATE TABLE IF NOT EXISTS settings (
  device_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER
);
