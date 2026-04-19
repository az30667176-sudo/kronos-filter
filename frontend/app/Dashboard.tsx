"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
} from "recharts";
import type { ProbabilityReport, TickerMetrics } from "@/types";

function pctColor(pct: number): string {
  if (pct > 0.05) return "var(--green)";
  if (pct > 0) return "#86d4a8";
  if (pct > -0.05) return "#d4a86b";
  return "var(--red)";
}

function formatPct(v: number, sign = false, digits = 1): string {
  const s = (v * 100).toFixed(digits);
  if (sign && v > 0) return `+${s}%`;
  return `${s}%`;
}

function ConfidenceBadge({ label }: { label: string }) {
  const map: Record<string, { bg: string; color: string; icon: string }> = {
    高: { bg: "rgba(61, 220, 151, 0.12)", color: "var(--green)", icon: "●" },
    中: { bg: "rgba(255, 184, 77, 0.12)", color: "var(--amber)", icon: "●" },
    低: { bg: "rgba(255, 107, 122, 0.12)", color: "var(--red)", icon: "●" },
  };
  const style = map[label] ?? { bg: "var(--border)", color: "var(--text-secondary)", icon: "⚪" };
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1"
      style={{ background: style.bg, color: style.color }}
    >
      <span>{style.icon}</span>
      {label}
    </span>
  );
}

function SignalBadge({ category }: { category: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    "Strong Bullish": { bg: "rgba(61, 220, 151, 0.18)", color: "#7dffb8" },
    Bullish: { bg: "rgba(61, 220, 151, 0.1)", color: "var(--green)" },
    Neutral: { bg: "var(--border)", color: "var(--text-secondary)" },
    Bearish: { bg: "rgba(255, 107, 122, 0.1)", color: "var(--red)" },
    "Strong Bearish": { bg: "rgba(255, 107, 122, 0.18)", color: "#ff9aa6" },
  };
  const style = map[category] ?? { bg: "var(--border)", color: "var(--text-secondary)" };
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {category}
    </span>
  );
}

type SortKey = keyof TickerMetrics | "none";

export function Dashboard({ report }: { report: ProbabilityReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("prob_up");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    report.tickers[0]?.ticker ?? null,
  );

  const sorted = useMemo(() => {
    const list = [...report.tickers];
    if (sortKey === "none") return list;
    list.sort((a, b) => {
      const av = a[sortKey as keyof TickerMetrics];
      const bv = b[sortKey as keyof TickerMetrics];
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return list;
  }, [report.tickers, sortKey, sortAsc]);

  const selectedTicker = selected ?? sorted[0]?.ticker ?? null;
  const pathSummary = report.path_summaries.find((p) => p.ticker === selectedTicker);
  const metric = report.tickers.find((t) => t.ticker === selectedTicker);

  const chartData = useMemo(() => {
    if (!pathSummary) return [];
    const rows: Array<{
      date: string;
      close?: number;
      median?: number;
      p5?: number;
      p25?: number;
      p75?: number;
      p95?: number;
      band50Low?: number;
      band50Span?: number;
      band90Low?: number;
      band90Span?: number;
    }> = [];
    for (let i = 0; i < pathSummary.history_dates.length; i++) {
      rows.push({
        date: pathSummary.history_dates[i].slice(0, 10),
        close: pathSummary.history_close[i],
      });
    }
    for (let i = 0; i < pathSummary.future_dates.length; i++) {
      rows.push({
        date: pathSummary.future_dates[i].slice(0, 10),
        median: pathSummary.median_path[i],
        p5: pathSummary.p5_path[i],
        p25: pathSummary.p25_path[i],
        p75: pathSummary.p75_path[i],
        p95: pathSummary.p95_path[i],
        band50Low: pathSummary.p25_path[i],
        band50Span: pathSummary.p75_path[i] - pathSummary.p25_path[i],
        band90Low: pathSummary.p5_path[i],
        band90Span: pathSummary.p95_path[i] - pathSummary.p5_path[i],
      });
    }
    return rows;
  }, [pathSummary]);

  const today = pathSummary?.history_dates.slice(-1)[0]?.slice(0, 10);

  const headers: { key: SortKey; label: string; align?: "left" | "right" }[] = [
    { key: "ticker", label: "Ticker" },
    { key: "signal_category", label: "Signal" },
    { key: "prob_up", label: "prob_up", align: "right" },
    { key: "prob_up_5pct", label: "prob_up_5%", align: "right" },
    { key: "expected_return_overall", label: "E[ret]", align: "right" },
    { key: "p5", label: "p5", align: "right" },
    { key: "p50", label: "p50", align: "right" },
    { key: "p95", label: "p95", align: "right" },
    { key: "expected_max_drawdown", label: "max_dd", align: "right" },
    { key: "confidence_label", label: "Conf" },
  ];

  return (
    <div>
      {/* Prominent latest-result header */}
      <div
        className="rounded-xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, var(--bg-card) 0%, var(--bg-elevated) 100%)",
          border: "1px solid var(--accent-dim)",
        }}
      >
        <div>
          <div
            className="text-xs mono uppercase tracking-wider mb-1"
            style={{ color: "var(--accent)" }}
          >
            Latest prediction
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-2xl font-bold mono" style={{ color: "var(--text-primary)" }}>
              {report.generated_at.slice(0, 10)}
            </span>
            <span className="text-sm mono" style={{ color: "var(--text-muted)" }}>
              {report.generated_at.slice(11, 16)} UTC
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            Data as of{" "}
            <span className="mono" style={{ color: "var(--text-primary)" }}>
              {report.data_last_date?.slice(0, 10) ?? "—"}
            </span>{" "}
            · {report.tickers.length} tickers
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span
            className="px-2.5 py-1 rounded text-xs mono"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Kronos-{report.config.model_size}
          </span>
          <span
            className="px-2.5 py-1 rounded text-xs mono"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            lookback {report.config.lookback}
          </span>
          <span
            className="px-2.5 py-1 rounded text-xs mono"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            pred {report.config.pred_len}
          </span>
          <span
            className="px-2.5 py-1 rounded text-xs mono"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            samples {report.config.samples}
          </span>
        </div>
      </div>

      {/* Honest framing banner */}
      <div
        className="mb-8 p-3 rounded-lg text-xs leading-relaxed"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        ⚠️ These are <b>model-subjective probabilities</b> from Kronos&apos;s internal distribution of sampled paths.
        Not actual real-world probabilities. Not financial advice.
      </div>

      {/* Probability table */}
      <section className="mb-10">
        <h2
          className="text-lg font-semibold mb-3 font-[family-name:var(--font-playfair)]"
          style={{ color: "var(--text-primary)" }}
        >
          Probability Ranking
        </h2>
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {headers.map((h) => (
                  <th
                    key={h.key}
                    className={`px-3 py-2.5 font-medium cursor-pointer hover:opacity-80 ${h.align === "right" ? "text-right" : "text-left"}`}
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => {
                      if (sortKey === h.key) setSortAsc(!sortAsc);
                      else {
                        setSortKey(h.key);
                        setSortAsc(false);
                      }
                    }}
                  >
                    {h.label}
                    {sortKey === h.key ? (sortAsc ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const isSelected = m.ticker === selectedTicker;
                return (
                  <tr
                    key={m.ticker}
                    onClick={() => setSelected(m.ticker)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: isSelected ? "var(--bg-elevated)" : "transparent",
                    }}
                  >
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--accent)" }}>
                      {m.ticker}
                    </td>
                    <td className="px-3 py-2.5">
                      <SignalBadge category={m.signal_category} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatPct(m.prob_up, false, 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatPct(m.prob_up_5pct, false, 0)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums font-medium"
                      style={{ color: pctColor(m.expected_return_overall) }}
                    >
                      {formatPct(m.expected_return_overall, true)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: pctColor(m.p5) }}
                    >
                      {formatPct(m.p5, true)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: pctColor(m.p50) }}
                    >
                      {formatPct(m.p50, true)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums"
                      style={{ color: pctColor(m.p95) }}
                    >
                      {formatPct(m.p95, true)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--red)" }}>
                      {formatPct(m.expected_max_drawdown, false)}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfidenceBadge label={m.confidence_label} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fan chart for selected ticker */}
      {selectedTicker && metric && pathSummary && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2
              className="text-lg font-semibold font-[family-name:var(--font-playfair)]"
              style={{ color: "var(--text-primary)" }}
            >
              Fan Chart: {selectedTicker}
            </h2>
            <div className="flex gap-4 text-sm" style={{ color: "var(--text-muted)" }}>
              <span>
                prob_up:{" "}
                <span style={{ color: "var(--text-primary)" }}>{formatPct(metric.prob_up, false, 0)}</span>
              </span>
              <span>
                E[ret]:{" "}
                <span style={{ color: pctColor(metric.expected_return_overall) }}>
                  {formatPct(metric.expected_return_overall, true)}
                </span>
              </span>
              <span>
                P5~P95:{" "}
                <span style={{ color: "var(--text-primary)" }}>
                  {formatPct(metric.p5, true)} ~ {formatPct(metric.p95, true)}
                </span>
              </span>
            </div>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 11 }}
                  minTickGap={30}
                />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text-primary)",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
                />
                {/* 90% band (P5-P95) */}
                <Area
                  type="monotone"
                  dataKey="band90Low"
                  stackId="band90"
                  stroke="none"
                  fill="transparent"
                  legendType="none"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="band90Span"
                  stackId="band90"
                  stroke="none"
                  fill="var(--accent)"
                  fillOpacity={0.1}
                  name="P5-P95 band"
                  isAnimationActive={false}
                />
                {/* 50% band (P25-P75) */}
                <Area
                  type="monotone"
                  dataKey="band50Low"
                  stackId="band50"
                  stroke="none"
                  fill="transparent"
                  legendType="none"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="band50Span"
                  stackId="band50"
                  stroke="none"
                  fill="var(--accent)"
                  fillOpacity={0.25}
                  name="P25-P75 band"
                  isAnimationActive={false}
                />
                {/* History */}
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="var(--text-primary)"
                  strokeWidth={2}
                  dot={false}
                  name="Historical"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {/* Median */}
                <Line
                  type="monotone"
                  dataKey="median"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                  name="Median path"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {today && (
                  <ReferenceLine
                    x={today}
                    stroke="var(--purple)"
                    strokeDasharray="4 4"
                    label={{ value: "Today", fill: "var(--purple)", fontSize: 11 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Failed tickers list */}
      {report.failed_tickers.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-muted)" }}>
            Skipped ({report.failed_tickers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {report.failed_tickers.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded text-xs"
                style={{ background: "var(--border)", color: "var(--text-secondary)" }}
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
