ALTER TABLE rate_limit_log ADD COLUMN account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rate_limit_account ON rate_limit_log(account_id, endpoint, attempted_at);
