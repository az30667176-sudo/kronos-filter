"use client";

import { useState, useEffect, useRef } from "react";
import { callPredict, type SpaceResponse, SPACE_BASE_URL } from "@/lib/gradio";
import {
  buildFingerprint,
  findRecentRunByFingerprint,
  saveRun,
  getSupabase,
} from "@/lib/supabase";

type PredictRequest = {
  tickers: string[];
  lookback: number;
  pred_len: number;
  samples: number;
  seed: number | null;
};

// Cross-tab lock: in localStorage, cleared on completion. Includes timestamp so a stale
// lock (e.g. user closed tab mid-run) is auto-ignored after 10 minutes.
const LOCK_KEY = "kronos:running_lock";
const LOCK_STALE_MS = 10 * 60 * 1000;

type RunningLock = {
  fingerprint: string;
  started_at: string; // ISO
  tab_id: string;
};

function readLock(): RunningLock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw) as RunningLock;
    const age = Date.now() - new Date(lock.started_at).getTime();
    if (age > LOCK_STALE_MS) {
      localStorage.removeItem(LOCK_KEY);
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

function writeLock(lock: RunningLock) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}

function clearLock() {
  localStorage.removeItem(LOCK_KEY);
}

// Lightweight result cache: identical fingerprint within CACHE_MS returns cached result instantly.
// Supabase also covers this but local cache is faster and avoids a round-trip.
const CACHE_KEY = "kronos:result_cache";
const CACHE_MS = 5 * 60 * 1000;

type CachedResult = {
  fingerprint: string;
  completed_at: string;
  report: SpaceResponse;
};

function readCache(): CachedResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedResult[];
  } catch {
    return [];
  }
}

function writeCache(entry: CachedResult) {
  const items = readCache();
  items.unshift(entry);
  // Keep last 15 cached results
  const trimmed = items.slice(0, 15);
  localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
}

function findInCache(fingerprint: string): CachedResult | null {
  const items = readCache();
  for (const it of items) {
    if (it.fingerprint !== fingerprint) continue;
    const age = Date.now() - new Date(it.completed_at).getTime();
    if (age <= CACHE_MS) return it;
  }
  return null;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface PredictFormProps {
  onResult?: (report: SpaceResponse, source: "live" | "cache" | "supabase") => void;
}

export function PredictForm({ onResult }: PredictFormProps) {
  const [tickersRaw, setTickersRaw] = useState("MSFT, NVDA, AAPL");
  const [samples, setSamples] = useState(15);
  const [predLen, setPredLen] = useState(20);
  const [lookback, setLookback] = useState(400);
  const [seed, setSeed] = useState<number | null>(42);

  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cacheHit, setCacheHit] = useState<null | "local" | "supabase">(null);

  const [otherTabLock, setOtherTabLock] = useState<RunningLock | null>(null);
  const tabId = useRef(randomId());

  // Watch for cross-tab lock changes
  useEffect(() => {
    const checkLock = () => {
      const lock = readLock();
      if (lock && lock.tab_id !== tabId.current) {
        setOtherTabLock(lock);
      } else {
        setOtherTabLock(null);
      }
    };
    checkLock();
    const interval = setInterval(checkLock, 2000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_KEY) checkLock();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Elapsed timer while loading
  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, [loading]);

  const handleRun = async () => {
    setError(null);
    setCacheHit(null);

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

    const req: PredictRequest = { tickers, lookback, pred_len: predLen, samples, seed };
    const fp = buildFingerprint(req);

    // 1. Local cache dedup
    const localHit = findInCache(fp);
    if (localHit) {
      setCacheHit("local");
      setStage("⚡ Served from local cache");
      onResult?.(localHit.report, "cache");
      return;
    }

    // 2. Supabase dedup (cross-device)
    setLoading(true);
    setStage("Checking recent runs...");
    setElapsedMs(0);

    try {
      const supaHit = await findRecentRunByFingerprint(fp, 5);
      if (supaHit) {
        setCacheHit("supabase");
        setStage("⚡ Served from Supabase cache");
        writeCache({ fingerprint: fp, completed_at: supaHit.created_at, report: supaHit.report });
        onResult?.(supaHit.report, "supabase");
        setLoading(false);
        return;
      }

      // 3. Cross-tab lock check
      const existing = readLock();
      if (existing && existing.tab_id !== tabId.current) {
        const age = Math.floor((Date.now() - new Date(existing.started_at).getTime()) / 1000);
        setError(
          `Another tab is already running a prediction (${age}s ago). Wait or refresh that tab.`,
        );
        setLoading(false);
        return;
      }

      writeLock({
        fingerprint: fp,
        started_at: new Date().toISOString(),
        tab_id: tabId.current,
      });

      // 4. Call HF Space
      setStage("Submitting to Kronos...");
      const report = await callPredict(req, (s) => setStage(s));

      // 5. Save to Supabase + local cache
      setStage("Saving to database...");
      try {
        await saveRun(report, tickers, fp);
      } catch (e) {
        console.warn("saveRun failed, result still displayed:", e);
      }
      writeCache({ fingerprint: fp, completed_at: new Date().toISOString(), report });

      onResult?.(report, "live");
      setStage("Done ✓");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStage("");
    } finally {
      clearLock();
      setLoading(false);
    }
  };

  const supabaseAvailable = !!getSupabase();

  return (
    <section className="mb-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          <span className="gradient-text">Run a prediction</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Enter tickers, click <b>Predict</b>. Kronos runs on ZeroGPU. Every run is saved
          with a timestamp and fingerprinted so identical requests within 5 minutes return
          instantly from cache.
        </p>
      </div>

      {otherTabLock && (
        <div
          className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
          style={{
            background: "rgba(255, 184, 77, 0.1)",
            border: "1px solid rgba(255, 184, 77, 0.3)",
            color: "var(--amber)",
          }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--amber)" }}
          />
          <span>
            Another browser tab is running a prediction
            ({Math.floor((Date.now() - new Date(otherTabLock.started_at).getTime()) / 1000)}s ago).
            Wait for it to finish or refresh that tab.
          </span>
        </div>
      )}

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
            disabled={loading || !!otherTabLock}
            className="px-6 py-2.5 rounded-lg font-semibold text-sm transition-all cursor-pointer hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
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
          {(loading || cacheHit) && (
            <div className="text-sm flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
              <span>{stage}</span>
              {loading && (
                <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
                  ({(elapsedMs / 1000).toFixed(1)}s)
                </span>
              )}
            </div>
          )}
          {!loading && stage === "Done ✓" && (
            <span className="text-sm" style={{ color: "var(--green)" }}>
              ✓ Saved to database — see Dashboard / History
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
              First request after Space sleep takes ~30s. Retry usually works. Check{" "}
              <a
                href={SPACE_BASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
                className="underline"
              >
                Space status
              </a>
              .
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <div>
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
          on HuggingFace ZeroGPU
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: supabaseAvailable ? "var(--green)" : "var(--red)" }}
          />
          <span>{supabaseAvailable ? "Supabase connected" : "Supabase offline"}</span>
        </div>
      </div>
    </section>
  );
}
