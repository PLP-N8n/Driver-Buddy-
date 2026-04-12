CREATE TABLE IF NOT EXISTS rate_limit_log (
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_endpoint ON rate_limit_log(ip, endpoint, attempted_at);
