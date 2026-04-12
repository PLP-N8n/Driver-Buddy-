-- Stores the Plaid access token per user (encrypted reference only)
CREATE TABLE IF NOT EXISTS plaid_connections (
  account_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  item_id TEXT NOT NULL,
  institution_name TEXT,
  institution_id TEXT,
  connected_at INTEGER NOT NULL,
  last_synced_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Stores imported transactions from Plaid
CREATE TABLE IF NOT EXISTS plaid_transactions (
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  plaid_transaction_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  merchant_name TEXT,
  category TEXT,
  is_earnings INTEGER NOT NULL DEFAULT 0,
  is_expense INTEGER NOT NULL DEFAULT 0,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (id, account_id),
  UNIQUE (account_id, plaid_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_plaid_transactions_account ON plaid_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date ON plaid_transactions(account_id, date);
