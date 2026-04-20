"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listRuns, updateRunMetadata, type KronosRun } from "@/lib/supabase";

function formatUtc(iso: string): string {
  if (!iso) return "—";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function HistoryClient() {
  const [runs, setRuns] = useState<KronosRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  const load = () => {
    setError(null);
    listRuns(100)
      .then((r) => setRuns(r))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load();
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    (runs || []).forEach((r) => {
      if (r.tag) set.add(r.tag);
    });
    return Array.from(set).sort();
  }, [runs]);

  const filtered = useMemo(() => {
    if (!runs) return [];
    let list = runs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.tickers.some((t) => t.toLowerCase().includes(q)) ||
          (r.note || "").toLowerCase().includes(q) ||
          (r.tag || "").toLowerCase().includes(q),
      );
    }
    if (filterTag) list = list.filter((r) => r.tag === filterTag);
    if (showPinnedOnly) list = list.filter((r) => r.pinned);
    return list;
  }, [runs, search, filterTag, showPinnedOnly]);

  const handleTogglePin = async (r: KronosRun) => {
    const next = !r.pinned;
    await updateRunMetadata(r.id, { pinned: next });
    setRuns((prev) => (prev ? prev.map((x) => (x.id === r.id ? { ...x, pinned: next } : x)) : prev));
  };

  const handleTag = async (r: KronosRun) => {
    const input = window.prompt("Tag (e.g. watchlist, experiment, deep-dive):", r.tag ?? "");
    if (input === null) return;
    const val = input.trim() || null;
    await updateRunMetadata(r.id, { tag: val });
    setRuns((prev) => (prev ? prev.map((x) => (x.id === r.id ? { ...x, tag: val } : x)) : prev));
  };

  const handleNote = async (r: KronosRun) => {
    const input = window.prompt("Note for this run:", r.note ?? "");
    if (input === null) return;
    const val = input.trim() || null;
    await updateRunMetadata(r.id, { note: val });
    setRuns((prev) => (prev ? prev.map((x) => (x.id === r.id ? { ...x, note: val } : x)) : prev));
  };

  if (error) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        <p style={{ color: "var(--red)" }}>Error loading history: {error}</p>
      </div>
    );
  }

  if (runs === null) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        Loading...
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
          Supabase · {runs.length} runs
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Prediction <span className="gradient-text">history</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Every prediction is timestamped and persisted. Click any row to view the full report.
          Tag runs to organize your research; pin important ones to keep them at the top.
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search ticker, tag, or note..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 rounded-lg outline-none text-sm"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <select
          value={filterTag ?? ""}
          onChange={(e) => setFilterTag(e.target.value || null)}
          className="px-3 py-2 rounded-lg outline-none text-sm"
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={showPinnedOnly}
            onChange={(e) => setShowPinnedOnly(e.target.checked)}
          />
          Pinned only
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
          <p className="text-xl mb-2" style={{ color: "var(--text-secondary)" }}>
            {runs.length === 0 ? "No runs yet" : "No runs match the filter"}
          </p>
          {runs.length === 0 && (
            <p className="text-sm">
              Head to the{" "}
              <Link href="/" style={{ color: "var(--accent)" }} className="underline">
                Predict page
              </Link>{" "}
              to run your first.
            </p>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Tickers
                </th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Config
                </th>
                <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Tag / Note
                </th>
                <th className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: r.pinned ? "rgba(0, 217, 255, 0.03)" : undefined,
                  }}
                >
                  <td className="px-4 py-3.5">
                    <Link href={`/run/${r.id}`} className="inline-flex flex-col">
                      <span className="mono text-sm" style={{ color: "var(--text-primary)" }}>
                        {formatUtc(r.created_at)}
                      </span>
                      <span className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {relativeTime(r.created_at)}
                        {r.pinned && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded text-xs mono"
                            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                          >
                            📌 PINNED
                          </span>
                        )}
                        {i === 0 && !r.pinned && (
                          <span
                            className="ml-2 px-1.5 py-0.5 rounded text-xs mono"
                            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                          >
                            LATEST
                          </span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-sm">
                      {r.tickers.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded text-xs mono"
                          style={{
                            background: "var(--bg-input)",
                            color: "var(--accent)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {t}
                        </span>
                      ))}
                      {r.tickers.length > 6 && (
                        <span className="text-xs self-center" style={{ color: "var(--text-muted)" }}>
                          +{r.tickers.length - 6}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 mono text-xs" style={{ color: "var(--text-muted)" }}>
                    lb={r.config.lookback} · pl={r.config.pred_len} · s={r.config.samples}
                    {r.config.seed !== null && ` · seed=${r.config.seed}`}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1">
                      {r.tag && (
                        <span
                          className="px-2 py-0.5 rounded text-xs mono self-start"
                          style={{ background: "var(--bg-input)", color: "var(--accent-alt)" }}
                        >
                          #{r.tag}
                        </span>
                      )}
                      {r.note && (
                        <span
                          className="text-xs max-w-xs truncate"
                          style={{ color: "var(--text-secondary)" }}
                          title={r.note}
                        >
                          {r.note}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleTogglePin(r)}
                        title={r.pinned ? "Unpin" : "Pin"}
                        className="px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80"
                        style={{
                          background: r.pinned ? "var(--accent-dim)" : "transparent",
                          color: r.pinned ? "var(--accent)" : "var(--text-muted)",
                        }}
                      >
                        📌
                      </button>
                      <button
                        onClick={() => handleTag(r)}
                        title="Edit tag"
                        className="px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80"
                        style={{ color: "var(--text-muted)" }}
                      >
                        🏷
                      </button>
                      <button
                        onClick={() => handleNote(r)}
                        title="Edit note"
                        className="px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80"
                        style={{ color: "var(--text-muted)" }}
                      >
                        📝
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
