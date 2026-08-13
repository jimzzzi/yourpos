CREATE TABLE IF NOT EXISTS cash_movements (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id INTEGER,
  type TEXT NOT NULL CHECK (type IN ('cash_in','cash_out')),
  amount NUMERIC(10,2) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
