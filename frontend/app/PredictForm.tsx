"use client";

import { useState, useEffect } from "react";
import { callPredict, type SpaceResponse, SPACE_BASE_URL } from "@/lib/gradio";

type SavedRun = {
  id: string; // timestamp-based, for localStorage key
  tickers: string[];
  samples: number;
  pred_len: number;
  lookback: number;
  seed: number | null;
  generated_at: string;
  report: SpaceResponse;
};

const HISTORY_KEY = "kronos:runs";
const MAX_HISTORY = 20;

function loadHistory(): SavedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRun(run: SavedRun) {
  const all = loadHistory();
  all.unshift(run);
  const trimmed = all.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

export interface PredictFormProps {
  onResult?: (report: SpaceResponse) => void;
}

export function PredictForm({ onResult }: PredictFormProps) {
  const [tickersRaw, setTickersRaw] = useState("MSFT, NVDA, AAPL");
  const [samples, setSamples] = useState(30);
  const [predLen, setPredLen] = useState(30);
  const [lookback, setLookback] = useState(400);
  const [seed, setSeed] = useState<number | null>(42);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // tick elapsed time while loading
  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, [loading]);

  const handleRun = async () => {
    setError(null);
    const tickers = tickersRaw
      .split(/[,\s\n]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) {
      setError("Please enter at least one ticker.");
      return;
    }
    if (tickers.length > 30) {
      setError("Max 30 tickers per request.");
      return;
    }

    setLoading(true);
    setStage("Submitting request...");
    setElapsedMs(0);

    try {
      const report = await callPredict(
        { tickers, lookback, pred_len: predLen, samples, seed },
        (s) => setStage(s),
      );
      const run: SavedRun = {
        id: report.generated_at,
        tickers,
        samples,
        pred_len: predLen,
        lookback,
        seed,
        generated_at: report.generated_at,
        report,
      };
      saveRun(run);
      onResult?.(report);
      setStage("Done ✓");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          <span className="gradient-text">Run a prediction</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Enter tickers, click <b>Predict</b>, and Kronos will run remotely on HuggingFace Space.
          Each run is saved to your browser history with a timestamp.
        </p>
      </div>

      <div
        className="rounded-xl p-6 mb-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <label
          className="block text-xs mb-2 mono uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Tickers (comma or newline separated, max 30)
        </label>
        <textarea
          value={tickersRaw}
          onChange={(e) => setTickersRaw(e.target.value)}
          rows={3}
          placeholder="MSFT, NVDA, AAPL"
          disabled={loading}
          className="w-full px-4 py-3 rounded-lg outline-none mono text-sm transition-colors focus:ring-1 disabled:opacity-60"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div>
            <label className="block text-xs mb-1.5 mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Lookback
            </label>
            <input
              type="number"
              value={lookback}
              onChange={(e) => setLookback(Math.max(50, Math.min(512, Number(e.target.value))))}
              min={50} max={512}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm disabled:opacity-60"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5 mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Pred_len
            </label>
            <input
              type="number"
              value={predLen}
              onChange={(e) => setPredLen(Math.max(1, Math.min(120, Number(e.target.value))))}
              min={1} max={120}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm disabled:opacity-60"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5 mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Samples
            </label>
            <input
              type="number"
              value={samples}
              onChange={(e) => setSamples(Math.max(5, Math.min(60, Number(e.target.value))))}
              min={5} max={60}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm disabled:opacity-60"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5 mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Seed
            </label>
            <input
              type="text"
              value={seed ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") setSeed(null);
                else if (/^\d+$/.test(v)) setSeed(Number(v));
              }}
              disabled={loading}
              placeholder="random"
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm disabled:opacity-60"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-4 flex-wrap">
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg font-semibold text-sm transition-all cursor-pointer hover:opacity-90 disabled:opacity-60 disabled:cursor-wait"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-alt) 100%)",
              color: "#0a0e1a",
            }}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full animate-pulse"
                  style={{ background: "#0a0e1a" }}
                />
                Running...
              </span>
            ) : (
              "🚀 Predict"
            )}
          </button>
          {loading && (
            <div className="text-sm flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              <span>{stage}</span>
              <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
                ({(elapsedMs / 1000).toFixed(1)}s)
              </span>
            </div>
          )}
          {!loading && stage === "Done ✓" && (
            <span className="text-sm" style={{ color: "var(--green)" }}>
              ✓ Done — results below
            </span>
          )}
        </div>

        {error && (
          <div
            className="mt-4 p-3 rounded-lg text-sm"
            style={{
              background: "rgba(255, 107, 122, 0.1)",
              border: "1px solid rgba(255, 107, 122, 0.3)",
              color: "var(--red)",
            }}
          >
            <b>Error:</b> {error}
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              If the Space is in cold start, first request can take ~45s while the model loads.
              Retry usually works. Also check{" "}
              <a
                href={SPACE_BASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
                className="underline"
              >
                the Space status
              </a>
              .
            </div>
          </div>
        )}
      </div>

      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        Powered by{" "}
        <a
          href={SPACE_BASE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          Kurtobe/kronos-filter
        </a>{" "}
        on HuggingFace Spaces · Free CPU tier · Cold starts add ~30s to first request.
      </div>
    </section>
  );
}
