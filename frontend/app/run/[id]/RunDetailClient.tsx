"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRunById, updateRunMetadata, type KronosRun } from "@/lib/supabase";
import { Dashboard } from "../../Dashboard";
import type { ProbabilityReport } from "@/types";

export function RunDetailClient({ id }: { id: string }) {
  const [run, setRun] = useState<KronosRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getRunById(id)
      .then((r) => {
        if (!r) setError("Run not found");
        else setRun(r);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const handleTag = async () => {
    if (!run) return;
    const input = window.prompt("Tag:", run.tag ?? "");
    if (input === null) return;
    const val = input.trim() || null;
    await updateRunMetadata(run.id, { tag: val });
    setRun({ ...run, tag: val });
  };

  const handleNote = async () => {
    if (!run) return;
    const input = window.prompt("Note:", run.note ?? "");
    if (input === null) return;
    const val = input.trim() || null;
    await updateRunMetadata(run.id, { note: val });
    setRun({ ...run, note: val });
  };

  const handlePin = async () => {
    if (!run) return;
    const next = !run.pinned;
    await updateRunMetadata(run.id, { pinned: next });
    setRun({ ...run, pinned: next });
  };

  if (loading) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }
  if (error || !run) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        <p style={{ color: "var(--red)" }}>{error ?? "Run not found"}</p>
        <Link href="/history" className="underline" style={{ color: "var(--accent)" }}>
          ← Back to history
        </Link>
      </div>
    );
  }

  return (
    <div>
      <nav className="mb-4 text-sm flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
        <Link href="/history" style={{ color: "var(--accent)" }} className="hover:underline">
          ← All runs
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePin}
            className="px-3 py-1 rounded text-xs cursor-pointer"
            style={{
              background: run.pinned ? "var(--accent-dim)" : "var(--bg-input)",
              color: run.pinned ? "var(--accent)" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {run.pinned ? "📌 Pinned" : "📌 Pin"}
          </button>
          <button
            onClick={handleTag}
            className="px-3 py-1 rounded text-xs cursor-pointer"
            style={{
              background: "var(--bg-input)",
              color: run.tag ? "var(--accent-alt)" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {run.tag ? `#${run.tag}` : "🏷 Tag"}
          </button>
          <button
            onClick={handleNote}
            className="px-3 py-1 rounded text-xs cursor-pointer"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            📝 Note
          </button>
        </div>
      </nav>
      {run.note && (
        <div
          className="mb-4 p-3 rounded-lg text-sm italic"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          {run.note}
        </div>
      )}
      <Dashboard report={run.report as unknown as ProbabilityReport} />
    </div>
  );
}
