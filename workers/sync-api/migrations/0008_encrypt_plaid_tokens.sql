ALTER TABLE plaid_connections RENAME TO plaid_connections_legacy_0008;

CREATE TABLE plaid_connections (
  account_id TEXT PRIMARY KEY,
  access_token TEXT,
  access_token_ciphertext TEXT,
  access_token_kid INTEGER DEFAULT 1,
  item_id TEXT NOT NULL,
  institution_name TEXT,
  institution_id TEXT,
  connected_at INTEGER NOT NULL,
  last_synced_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1
);

INSERT INTO plaid_connections (
  account_id,
  access_token,
  item_id,
  institution_name,
  institution_id,
  connected_at,
  last_synced_at,
  is_active
)
SELECT
  account_id,
  access_token,
  item_id,
  institution_name,
  institution_id,
  connected_at,
  last_synced_at,
  is_active
FROM plaid_connections_legacy_0008;

DROP TABLE plaid_connections_legacy_0008;
