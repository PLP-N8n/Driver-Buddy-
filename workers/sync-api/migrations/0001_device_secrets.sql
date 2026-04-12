CREATE TABLE IF NOT EXISTS device_secrets (
  account_id TEXT PRIMARY KEY,
  device_secret_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
