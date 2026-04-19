-- Recreate shifts with composite PRIMARY KEY (id, account_id).
-- Adds updated_at column.

CREATE TABLE IF NOT EXISTS shifts_new (
  id TEXT NOT NULL,
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
  updated_at TEXT,
  PRIMARY KEY (id, account_id)
);

INSERT OR IGNORE INTO shifts_new
  SELECT id, account_id, date, status, primary_platform, hours_worked, total_earnings,
         started_at, ended_at, start_odometer, end_odometer, business_miles, personal_gap_miles,
         gps_miles, mileage_source, start_lat, start_lng, end_lat, end_lng, fuel_liters,
         job_count, notes, created_at, NULL
  FROM shifts;

DROP TABLE shifts;
ALTER TABLE shifts_new RENAME TO shifts;

-- Recreate shift_earnings with composite PRIMARY KEY (id, account_id).

CREATE TABLE IF NOT EXISTS shift_earnings_new (
  id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  amount REAL NOT NULL,
  job_count INTEGER,
  PRIMARY KEY (id, account_id)
);

INSERT OR IGNORE INTO shift_earnings_new SELECT * FROM shift_earnings;
DROP TABLE shift_earnings;
ALTER TABLE shift_earnings_new RENAME TO shift_earnings;
