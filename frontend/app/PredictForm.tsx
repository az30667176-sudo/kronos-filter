"use client";

import { useState, useEffect } from "react";

type PredictRequest = {
  tickers: string[];
  samples: number;
  pred_len: number;
  lookback: number;
  seed: number | null;
  generated_at: string;
};

const STORAGE_KEY = "kronos:lastRequest";

function buildCommand(req: PredictRequest): string {
  const parts = [
    "python main.py",
    `--tickers ${req.tickers.join(",")}`,
    `--lookback ${req.lookback}`,
    `--pred_len ${req.pred_len}`,
    `--samples ${req.samples}`,
  ];
  if (req.seed !== null) parts.push(`--seed ${req.seed}`);
  return parts.join(" ");
}

export function PredictForm() {
  const [tickersRaw, setTickersRaw] = useState("MSFT, NVDA, AAPL");
  const [samples, setSamples] = useState(30);
  const [predLen, setPredLen] = useState(30);
  const [lookback, setLookback] = useState(400);
  const [seed, setSeed] = useState<number | null>(42);
  const [command, setCommand] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<PredictRequest | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLastRun(JSON.parse(raw));
    } catch {}
  }, []);

  const handleGenerate = () => {
    const tickers = tickersRaw
      .split(/[,\s\n]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;

    const req: PredictRequest = {
      tickers,
      samples,
      pred_len: predLen,
      lookback,
      seed,
      generated_at: new Date().toISOString(),
    };
    const cmd = buildCommand(req);
    setCommand(cmd);
    setLastRun(req);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(req));
  };

  const handleCopy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <section className="mb-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          <span className="gradient-text">Run a prediction</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Enter tickers, generate the CLI command, run it locally. Results appear below after{" "}
          <code className="mono" style={{ color: "var(--accent)" }}>git push</code>.
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
          Tickers (comma or newline separated)
        </label>
        <textarea
          value={tickersRaw}
          onChange={(e) => setTickersRaw(e.target.value)}
          rows={3}
          placeholder="MSFT, NVDA, AAPL"
          className="w-full px-4 py-3 rounded-lg outline-none mono text-sm transition-colors focus:ring-1"
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
              min={50}
              max={512}
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm"
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
              min={1}
              max={120}
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm"
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
              onChange={(e) => setSamples(Math.max(5, Math.min(100, Number(e.target.value))))}
              min={5}
              max={100}
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm"
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
              placeholder="random"
              className="w-full px-3 py-2 rounded-lg outline-none mono text-sm"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <button
          onClick={handleGenerate}
          className="mt-5 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all cursor-pointer hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-alt) 100%)",
            color: "#0a0e1a",
          }}
        >
          Generate command →
        </button>
      </div>

      {/* Generated command output */}
      {command && (
        <div
          className="rounded-xl p-5 mb-4"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--accent-dim)",
            boxShadow: "0 0 0 1px var(--accent-dim)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs mono uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              Step 1 · Copy & run this command
            </div>
            <button
              onClick={handleCopy}
              className="text-xs px-3 py-1 rounded mono cursor-pointer"
              style={{
                background: copied ? "var(--green)" : "var(--accent-dim)",
                color: copied ? "#0a0e1a" : "var(--accent)",
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <pre
            className="mono text-sm overflow-x-auto whitespace-pre-wrap break-all"
            style={{ color: "var(--text-primary)" }}
          >
            <span style={{ color: "var(--text-muted)" }}>{"$ "}</span>
            {command}
          </pre>
          <div
            className="mt-4 pt-4 text-xs leading-relaxed"
            style={{ borderTop: "1px dashed var(--border)", color: "var(--text-secondary)" }}
          >
            <div className="mb-1.5">
              <b style={{ color: "var(--accent-alt)" }}>Step 2 ·</b>{" "}
              Run{" "}
              <code className="mono" style={{ color: "var(--accent)" }}>
                python export_to_hub.py
              </code>{" "}
              to bridge to insights-hub (optional)
            </div>
            <div>
              <b style={{ color: "var(--accent-alt)" }}>Step 3 ·</b>{" "}
              <code className="mono" style={{ color: "var(--accent)" }}>
                git add results/ && git commit -m &quot;...&quot; && git push
              </code>{" "}
              — Vercel will auto-rebuild and your results will appear below within 2 min.
            </div>
          </div>
        </div>
      )}

      {lastRun && !command && (
        <div className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
          Last request (local): {new Date(lastRun.generated_at).toLocaleString()} ·{" "}
          {lastRun.tickers.length} tickers ({lastRun.tickers.slice(0, 5).join(", ")}
          {lastRun.tickers.length > 5 ? "…" : ""})
        </div>
      )}
    </section>
  );
}
