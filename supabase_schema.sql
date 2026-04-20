-- Kronos Filter: Supabase schema
-- Tables: kronos_runs (one per Predict click) + kronos_predictions (one per ticker per run)

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- kronos_runs: one row per prediction run
-- =============================================================
CREATE TABLE IF NOT EXISTS public.kronos_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dedup key: hash of (sorted_tickers + lookback + pred_len + samples + seed + model_size)
  fingerprint TEXT UNIQUE NOT NULL,
  tickers TEXT[] NOT NULL,
  config JSONB NOT NULL,             -- { lookback, pred_len, samples, seed, model_size, interval, T, top_p }
  data_last_date DATE,
  failed_tickers TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Full report as returned by HF Space (for fallback / re-display)
  report JSONB NOT NULL,
  -- User metadata
  tag TEXT,
  note TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_kronos_runs_created
  ON public.kronos_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kronos_runs_tickers
  ON public.kronos_runs USING GIN(tickers);

-- =============================================================
-- kronos_predictions: one row per ticker per run (normalized for easy querying)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.kronos_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.kronos_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  ticker TEXT NOT NULL,
  data_last_date DATE NOT NULL,         -- last historical bar fed to Kronos
  pred_len_bars INTEGER NOT NULL,       -- how many future bars predicted
  pred_end_date DATE NOT NULL,          -- expected end of prediction window (for scoring)

  -- Denormalized from metrics for easy SQL queries
  initial_close DOUBLE PRECISION,
  prob_up DOUBLE PRECISION,
  prob_down DOUBLE PRECISION,
  prob_up_5pct DOUBLE PRECISION,
  prob_down_5pct DOUBLE PRECISION,
  expected_return_up DOUBLE PRECISION,
  expected_return_down DOUBLE PRECISION,
  expected_return_overall DOUBLE PRECISION,
  p5 DOUBLE PRECISION,
  p25 DOUBLE PRECISION,
  p50 DOUBLE PRECISION,
  p75 DOUBLE PRECISION,
  p95 DOUBLE PRECISION,
  expected_max_drawdown DOUBLE PRECISION,
  confidence_std DOUBLE PRECISION,
  confidence_label TEXT,
  signal_category TEXT,
  n_paths INTEGER,

  -- Full metrics (jsonb fallback)
  metrics JSONB NOT NULL,
  -- Path summary for chart reconstruction
  path_summary JSONB,

  -- Scoring (filled by daily cron after pred_end_date passes)
  actual_final_return DOUBLE PRECISION,
  actual_final_close DOUBLE PRECISION,
  actual_path JSONB,                    -- array of daily closes
  scored_at TIMESTAMPTZ,
  -- Scoring JSON: {hit_direction, in_p5_p95, percentile_of_actual, crps, magnitude_error, etc}
  scores JSONB
);

CREATE INDEX IF NOT EXISTS idx_kronos_pred_ticker
  ON public.kronos_predictions(ticker);

CREATE INDEX IF NOT EXISTS idx_kronos_pred_run
  ON public.kronos_predictions(run_id);

CREATE INDEX IF NOT EXISTS idx_kronos_pred_unscored
  ON public.kronos_predictions(pred_end_date)
  WHERE scored_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kronos_pred_created
  ON public.kronos_predictions(created_at DESC);

-- =============================================================
-- Row-level security: permissive for now (single user personal tool)
-- Later: add proper auth-based policies
-- =============================================================
ALTER TABLE public.kronos_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kronos_predictions ENABLE ROW LEVEL SECURITY;

-- Read / insert open to all (anon key can read+write for personal use).
-- Update restricted (via service key) for scoring.
DROP POLICY IF EXISTS "kronos_runs_read_all" ON public.kronos_runs;
CREATE POLICY "kronos_runs_read_all" ON public.kronos_runs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "kronos_runs_insert_all" ON public.kronos_runs;
CREATE POLICY "kronos_runs_insert_all" ON public.kronos_runs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "kronos_runs_update_all" ON public.kronos_runs;
CREATE POLICY "kronos_runs_update_all" ON public.kronos_runs
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "kronos_pred_read_all" ON public.kronos_predictions;
CREATE POLICY "kronos_pred_read_all" ON public.kronos_predictions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "kronos_pred_insert_all" ON public.kronos_predictions;
CREATE POLICY "kronos_pred_insert_all" ON public.kronos_predictions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "kronos_pred_update_all" ON public.kronos_predictions;
CREATE POLICY "kronos_pred_update_all" ON public.kronos_predictions
  FOR UPDATE USING (true);
