import { getSupabase, type KronosPrediction } from "./supabase";

export async function listScoredPredictions(limit = 500): Promise<KronosPrediction[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("kronos_predictions")
    .select("*")
    .not("scored_at", "is", null)
    .order("scored_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[supabase] listScoredPredictions:", error);
    return [];
  }
  return (data || []) as KronosPrediction[];
}

export async function listUnscoredPredictions(limit = 200): Promise<KronosPrediction[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("kronos_predictions")
    .select("*")
    .is("scored_at", null)
    .order("pred_end_date", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[supabase] listUnscoredPredictions:", error);
    return [];
  }
  return (data || []) as KronosPrediction[];
}

export interface AggregateScore {
  n: number;
  hit_rate: number | null;
  coverage_p5_p95: number | null;
  coverage_p25_p75: number | null;
  mean_percentile: number | null;
  mean_magnitude_error: number | null;
  mean_signed_error: number | null;
}

export function aggregateScores(preds: KronosPrediction[]): AggregateScore {
  if (preds.length === 0) {
    return {
      n: 0,
      hit_rate: null,
      coverage_p5_p95: null,
      coverage_p25_p75: null,
      mean_percentile: null,
      mean_magnitude_error: null,
      mean_signed_error: null,
    };
  }
  let hitCount = 0;
  let hitTotal = 0;
  let cov95Count = 0;
  let cov95Total = 0;
  let cov50Count = 0;
  let cov50Total = 0;
  let pctSum = 0;
  let pctTotal = 0;
  let magSum = 0;
  let magTotal = 0;
  let signedSum = 0;
  let signedTotal = 0;
  for (const p of preds) {
    const s = p.scores as Record<string, unknown> | null;
    if (!s) continue;
    if (typeof s.hit_direction === "boolean") {
      hitTotal++;
      if (s.hit_direction) hitCount++;
    }
    if (typeof s.in_p5_p95 === "boolean") {
      cov95Total++;
      if (s.in_p5_p95) cov95Count++;
    }
    if (typeof s.in_p25_p75 === "boolean") {
      cov50Total++;
      if (s.in_p25_p75) cov50Count++;
    }
    if (typeof s.percentile_of_actual === "number") {
      pctSum += s.percentile_of_actual;
      pctTotal++;
    }
    if (typeof s.magnitude_error === "number") {
      magSum += s.magnitude_error;
      magTotal++;
    }
    if (typeof s.signed_error === "number") {
      signedSum += s.signed_error;
      signedTotal++;
    }
  }
  return {
    n: preds.length,
    hit_rate: hitTotal ? hitCount / hitTotal : null,
    coverage_p5_p95: cov95Total ? cov95Count / cov95Total : null,
    coverage_p25_p75: cov50Total ? cov50Count / cov50Total : null,
    mean_percentile: pctTotal ? pctSum / pctTotal : null,
    mean_magnitude_error: magTotal ? magSum / magTotal : null,
    mean_signed_error: signedTotal ? signedSum / signedTotal : null,
  };
}
