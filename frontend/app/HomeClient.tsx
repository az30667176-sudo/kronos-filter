"use client";

import { useState } from "react";
import { PredictForm } from "./PredictForm";
import { Dashboard } from "./Dashboard";
import type { ProbabilityReport } from "@/types";

export interface HomeClientProps {
  initialReport: ProbabilityReport | null;
}

export function HomeClient({ initialReport }: HomeClientProps) {
  const [liveReport, setLiveReport] = useState<ProbabilityReport | null>(null);
  const [resultSource, setResultSource] = useState<"live" | "cache" | "supabase" | null>(null);

  const displayReport = liveReport ?? initialReport;

  return (
    <div>
      <PredictForm
        onResult={(report, source) => {
          setLiveReport(report as unknown as ProbabilityReport);
          setResultSource(source);
        }}
      />

      {displayReport ? (
        <>
          {liveReport && resultSource && (
            <div
              className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
              style={{
                background:
                  resultSource === "live"
                    ? "rgba(61, 220, 151, 0.08)"
                    : "rgba(0, 217, 255, 0.08)",
                border: `1px solid ${
                  resultSource === "live"
                    ? "rgba(61, 220, 151, 0.3)"
                    : "rgba(0, 217, 255, 0.3)"
                }`,
                color: resultSource === "live" ? "var(--green)" : "var(--accent)",
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: resultSource === "live" ? "var(--green)" : "var(--accent)" }}
              />
              <span>
                {resultSource === "live" && "Live result from your run (saved to database)."}
                {resultSource === "cache" && "⚡ Instantly served from local cache (identical request within 5 min)."}
                {resultSource === "supabase" && "⚡ Served from Supabase cache (identical request run recently)."}
              </span>
            </div>
          )}
          <Dashboard report={displayReport} />
        </>
      ) : (
        <div
          className="text-center py-20 rounded-xl"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-xl mb-2" style={{ color: "var(--text-secondary)" }}>
            No prediction yet
          </p>
          <p className="text-sm">Fill in tickers above and click Predict to get started.</p>
        </div>
      )}
    </div>
  );
}
