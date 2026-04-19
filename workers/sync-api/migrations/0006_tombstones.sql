-- Tombstones table for tracking deleted records across devices.
-- entity_type values: 'work_log', 'mileage_log', 'expense', 'shift'

CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (id, account_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_tombstones_account ON tombstones(account_id);
