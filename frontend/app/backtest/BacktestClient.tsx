"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listScoredPredictions,
  listUnscoredPredictions,
  aggregateScores,
} from "@/lib/backtest";
import type { KronosPrediction } from "@/lib/supabase";

function pct(v: number | null, digits = 0): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function signedPct(v: number | null, digits = 1): string {
  if (v === null || v === undefined) return "—";
  const s = (v * 100).toFixed(digits);
  return v > 0 ? `+${s}%` : `${s}%`;
}

export function BacktestClient() {
  const [scored, setScored] = useState<KronosPrediction[] | null>(null);
  const [unscored, setUnscored] = useState<KronosPrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"ticker" | "confidence" | "signal">("ticker");

  useEffect(() => {
    Promise.all([listScoredPredictions(500), listUnscoredPredictions(200)])
      .then(([s, u]) => {
        setScored(s);
        setUnscored(u);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const overall = useMemo(() => (scored ? aggregateScores(scored) : null), [scored]);

  const groupedStats = useMemo(() => {
    if (!scored || scored.length === 0) return [];
    const groups = new Map<string, KronosPrediction[]>();
    for (const p of scored) {
      let key: string;
      if (groupBy === "ticker") key = p.ticker;
      else if (groupBy === "confidence") key = p.confidence_label || "—";
      else key = p.signal_category || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.entries())
      .map(([key, preds]) => ({ key, ...aggregateScores(preds) }))
      .sort((a, b) => b.n - a.n);
  }, [scored, groupBy]);

  if (error) {
    return (
      <div className="text-center py-24" style={{ color: "var(--red)" }}>
        Error: {error}
      </div>
    );
  }

  if (scored === null) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        Loading backtest results...
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <div
          className="inline-block px-3 py-1 rounded-full text-xs mb-3 mono"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
            border: "1px solid var(--accent-dim)",
          }}
        >
          Accuracy · {scored.length} scored / {unscored?.length ?? 0} pending
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          <span className="gradient-text">Backtest</span> — how accurate is Kronos?
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Every prediction you made is scored after its window elapses (daily cron fetches actuals
          from Yahoo and compares to the predicted distribution).
        </p>
      </header>

      {/* Overall metrics */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Overall accuracy</h2>
        {scored.length === 0 ? (
          <div
            className="p-5 rounded-xl text-sm"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            No scored predictions yet. Predictions are scored after their{" "}
            <code className="mono" style={{ color: "var(--accent)" }}>
              pred_len
            </code>{" "}
            window has elapsed (~1 business day after pred_end_date).
            <br />
            {unscored && unscored.length > 0 && (
              <>
                Pending: <b>{unscored.length}</b> predictions · next maturity:{" "}
                <span className="mono">{unscored[0]?.pred_end_date}</span>
              </>
            )}
          </div>
        ) : (
          overall && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Direction hit rate"
                value={pct(overall.hit_rate)}
                hint="% of predictions where the sign was right"
                baseline="50% = coin flip"
              />
              <MetricCard
                label="P5–P95 coverage"
                value={pct(overall.coverage_p5_p95)}
                hint="% of actuals inside predicted 90% band"
                baseline="Ideal: ~90%"
              />
              <MetricCard
                label="P25–P75 coverage"
                value={pct(overall.coverage_p25_p75)}
                hint="% of actuals inside predicted 50% band"
                baseline="Ideal: ~50%"
              />
              <MetricCard
                label="Avg magnitude error"
                value={pct(overall.mean_magnitude_error, 2)}
                hint="|predicted return − actual return|"
                baseline="Lower is better"
              />
            </div>
          )
        )}
      </section>

      {/* Per-group breakdown */}
      {scored.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Breakdown</h2>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "ticker" | "confidence" | "signal")}
              className="px-3 py-1.5 rounded-lg outline-none text-xs"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              <option value="ticker">by Ticker</option>
              <option value="confidence">by Confidence (高/中/低)</option>
              <option value="signal">by Signal category</option>
            </select>
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Group
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    N
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Hit rate
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    P5-P95
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    P25-P75
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Mag err
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Signed err
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedStats.map((g) => (
                  <tr key={g.key} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-2.5 font-medium mono" style={{ color: "var(--accent)" }}>
                      {g.key}
                    </td>
                    <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-secondary)" }}>
                      {g.n}
                    </td>
                    <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-primary)" }}>
                      {pct(g.hit_rate)}
                    </td>
                    <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-secondary)" }}>
                      {pct(g.coverage_p5_p95)}
                    </td>
                    <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-secondary)" }}>
                      {pct(g.coverage_p25_p75)}
                    </td>
                    <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-muted)" }}>
                      {pct(g.mean_magnitude_error, 2)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right mono"
                      style={{
                        color:
                          g.mean_signed_error === null
                            ? "var(--text-muted)"
                            : g.mean_signed_error > 0
                              ? "var(--green)"
                              : "var(--red)",
                      }}
                    >
                      {signedPct(g.mean_signed_error)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent individual scored predictions */}
      {scored.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Recent scored predictions</h2>
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    Ticker
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    Predicted on
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    prob_up
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    E[ret]
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    Actual
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    Hit?
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
                    In 90%?
                  </th>
                </tr>
              </thead>
              <tbody>
                {scored.slice(0, 30).map((p) => {
                  const s = p.scores as Record<string, unknown> | null;
                  const hit = s?.hit_direction as boolean | undefined;
                  const in95 = s?.in_p5_p95 as boolean | undefined;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-2.5 mono" style={{ color: "var(--accent)" }}>
                        <Link href={`/run/${p.run_id}`} className="hover:underline">
                          {p.ticker}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {p.data_last_date} → {p.pred_end_date}
                      </td>
                      <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-secondary)" }}>
                        {pct(p.prob_up)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right mono"
                        style={{
                          color:
                            (p.expected_return_overall ?? 0) > 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {signedPct(p.expected_return_overall)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right mono font-medium"
                        style={{
                          color:
                            (p.actual_final_return ?? 0) > 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {signedPct(p.actual_final_return)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {hit === true && <span style={{ color: "var(--green)" }}>✓</span>}
                        {hit === false && <span style={{ color: "var(--red)" }}>✗</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {in95 === true && <span style={{ color: "var(--green)" }}>✓</span>}
                        {in95 === false && <span style={{ color: "var(--red)" }}>✗</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  baseline,
}: {
  label: string;
  value: string;
  hint: string;
  baseline: string;
}) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="text-3xl font-bold mono mb-1" style={{ color: "var(--accent)" }}>
        {value}
      </div>
      <div className="text-xs mb-0.5" style={{ color: "var(--text-secondary)" }}>
        {hint}
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {baseline}
      </div>
    </div>
  );
}
