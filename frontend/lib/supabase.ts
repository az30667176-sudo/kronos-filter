/**
 * Supabase client + CRUD helpers for kronos_runs / kronos_predictions.
 *
 * URL and anon key are baked in at build time from environment variables
 * (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
 * RLS is permissive on insert/select/update for this personal tool.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import type { SpaceResponse } from "./gradio";

// Use anon key for client-side code. Service key stays server-side only.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (_client === null) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// ----------------------------------------------------------------- Types

export interface KronosRun {
  id: string;
  created_at: string;
  fingerprint: string;
  tickers: string[];
  config: {
    lookback: number;
    pred_len: number;
    samples: number;
    seed: number | null;
    model_size: string;
    interval: string;
    T: number;
    top_p: number;
    device?: string;
  };
  data_last_date: string | null;
  failed_tickers: string[];
  report: SpaceResponse;
  tag: string | null;
  note: string | null;
  pinned: boolean;
}

export interface KronosPrediction {
  id: string;
  run_id: string;
  created_at: string;
  ticker: string;
  data_last_date: string;
  pred_len_bars: number;
  pred_end_date: string;
  initial_close: number | null;
  prob_up: number | null;
  prob_down: number | null;
  prob_up_5pct: number | null;
  prob_down_5pct: number | null;
  expected_return_up: number | null;
  expected_return_down: number | null;
  expected_return_overall: number | null;
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  expected_max_drawdown: number | null;
  confidence_std: number | null;
  confidence_label: string | null;
  signal_category: string | null;
  n_paths: number | null;
  metrics: Record<string, unknown>;
  path_summary: Record<string, unknown> | null;
  actual_final_return: number | null;
  actual_final_close: number | null;
  actual_path: unknown | null;
  scored_at: string | null;
  scores: Record<string, unknown> | null;
}

// ----------------------------------------------------------------- Fingerprinting

/**
 * Produce a deterministic fingerprint for a prediction request.
 * Identical requests (same tickers, same params, same seed) get the same fingerprint.
 */
export function buildFingerprint(req: {
  tickers: string[];
  lookback: number;
  pred_len: number;
  samples: number;
  seed: number | null;
}): string {
  const sortedTickers = [...req.tickers].map((t) => t.toUpperCase()).sort();
  const parts = [
    sortedTickers.join("|"),
    `lb=${req.lookback}`,
    `pl=${req.pred_len}`,
    `sm=${req.samples}`,
    `sd=${req.seed ?? "random"}`,
    "mdl=small",
  ];
  return parts.join("__");
}

// ----------------------------------------------------------------- Helpers: compute pred_end_date

/**
 * Add N business days to a Date, returning ISO date string.
 * (Matches Python pd.bdate_range behavior used in fetcher.py.)
 */
export function addBusinessDays(iso: string, days: number): string {
  const d = new Date(iso);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------- Queries

export async function findRecentRunByFingerprint(
  fingerprint: string,
  maxAgeMinutes = 5,
): Promise<KronosRun | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString();
  const { data, error } = await sb
    .from("kronos_runs")
    .select("*")
    .eq("fingerprint", fingerprint)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[supabase] findRecentRunByFingerprint:", error);
    return null;
  }
  return data as KronosRun | null;
}

/**
 * Insert a run + all its per-ticker predictions in a single transaction.
 * We don't have true transactions from the JS client, so we insert the run first,
 * then the predictions. If predictions fail we leave the run (will be retried if same fingerprint).
 */
export async function saveRun(
  report: SpaceResponse,
  tickers: string[],
  fingerprint: string,
): Promise<KronosRun | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const runRow = {
    fingerprint,
    tickers,
    config: report.config,
    data_last_date: report.data_last_date ? report.data_last_date.slice(0, 10) : null,
    failed_tickers: report.failed_tickers || [],
    report,
  };

  // Upsert on fingerprint so a rerun (different timestamp) returns the same row
  // Actually, since we dedup BEFORE calling Space, we shouldn't hit duplicate fingerprint
  // here. But use insert-and-return-existing pattern for safety.
  const { data: runData, error: runErr } = await sb
    .from("kronos_runs")
    .upsert([runRow], { onConflict: "fingerprint" })
    .select()
    .single();
  if (runErr || !runData) {
    console.error("[supabase] saveRun: run insert failed:", runErr);
    return null;
  }
  const run = runData as KronosRun;

  // Delete existing predictions for this run (if this was an upsert)
  await sb.from("kronos_predictions").delete().eq("run_id", run.id);

  // Build per-ticker prediction rows
  const pathSummaryByTicker = new Map<string, Record<string, unknown>>();
  for (const ps of report.path_summaries || []) {
    const t = (ps as { ticker?: string }).ticker;
    if (t) pathSummaryByTicker.set(t, ps as Record<string, unknown>);
  }

  const dataLastIso = report.data_last_date ? report.data_last_date.slice(0, 10) : null;
  const predLen = report.config.pred_len;

  const predRows = (report.tickers || []).map((m) => {
    const mt = m as Record<string, unknown>;
    const ticker = String(mt.ticker);
    const dataLastDate = dataLastIso || new Date().toISOString().slice(0, 10);
    const predEndDate = addBusinessDays(dataLastDate, predLen);
    return {
      run_id: run.id,
      ticker,
      data_last_date: dataLastDate,
      pred_len_bars: predLen,
      pred_end_date: predEndDate,
      initial_close: (mt.initial_close as number) ?? null,
      prob_up: (mt.prob_up as number) ?? null,
      prob_down: (mt.prob_down as number) ?? null,
      prob_up_5pct: (mt.prob_up_5pct as number) ?? null,
      prob_down_5pct: (mt.prob_down_5pct as number) ?? null,
      expected_return_up: (mt.expected_return_up as number) ?? null,
      expected_return_down: (mt.expected_return_down as number) ?? null,
      expected_return_overall: (mt.expected_return_overall as number) ?? null,
      p5: (mt.p5 as number) ?? null,
      p25: (mt.p25 as number) ?? null,
      p50: (mt.p50 as number) ?? null,
      p75: (mt.p75 as number) ?? null,
      p95: (mt.p95 as number) ?? null,
      expected_max_drawdown: (mt.expected_max_drawdown as number) ?? null,
      confidence_std: (mt.confidence_std as number) ?? null,
      confidence_label: (mt.confidence_label as string) ?? null,
      signal_category: (mt.signal_category as string) ?? null,
      n_paths: (mt.n_paths as number) ?? null,
      metrics: mt,
      path_summary: pathSummaryByTicker.get(ticker) || null,
    };
  });

  if (predRows.length > 0) {
    const { error: predErr } = await sb.from("kronos_predictions").insert(predRows);
    if (predErr) {
      console.error("[supabase] saveRun: predictions insert failed:", predErr);
    }
  }
  return run;
}

export async function listRuns(limit = 50): Promise<KronosRun[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("kronos_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[supabase] listRuns:", error);
    return [];
  }
  return (data || []) as KronosRun[];
}

export async function getRunById(id: string): Promise<KronosRun | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("kronos_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[supabase] getRunById:", error);
    return null;
  }
  return data as KronosRun | null;
}

export async function updateRunMetadata(
  id: string,
  patch: { tag?: string | null; note?: string | null; pinned?: boolean },
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from("kronos_runs").update(patch).eq("id", id);
  if (error) {
    console.error("[supabase] updateRunMetadata:", error);
    return false;
  }
  return true;
}
