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

  // liveReport (from just-completed Space run) takes priority over initialReport (from git-committed latest.json)
  const displayReport = liveReport ?? initialReport;

  return (
    <div>
      <PredictForm
        onResult={(report) => {
          // Gradio's JSON output matches ProbabilityReport shape
          setLiveReport(report as unknown as ProbabilityReport);
        }}
      />

      {displayReport ? (
        <>
          {liveReport && (
            <div
              className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
              style={{
                background: "rgba(61, 220, 151, 0.08)",
                border: "1px solid rgba(61, 220, 151, 0.3)",
                color: "var(--green)",
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: "var(--green)" }}
              />
              <span>Live result from the run you just triggered (saved to browser history).</span>
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
