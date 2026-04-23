CREATE TABLE IF NOT EXISTS account_devices (
  account_id TEXT NOT NULL,
  device_secret_hash TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  added_via TEXT NOT NULL DEFAULT 'register',
  PRIMARY KEY (account_id, device_secret_hash)
);

INSERT OR IGNORE INTO account_devices (account_id, device_secret_hash, added_at, added_via)
SELECT account_id, device_secret_hash, created_at, 'legacy'
FROM device_secrets;

CREATE INDEX IF NOT EXISTS idx_account_devices_account ON account_devices(account_id);
