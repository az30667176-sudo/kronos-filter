import fs from "fs";
import path from "path";
import type { ProbabilityReport } from "@/types";

const resultsDir = path.join(process.cwd(), "..", "results");

export function getLatestReport(): ProbabilityReport | null {
  const latest = path.join(resultsDir, "latest.json");
  if (!fs.existsSync(latest)) return null;
  try {
    const raw = fs.readFileSync(latest, "utf-8");
    return JSON.parse(raw) as ProbabilityReport;
  } catch {
    return null;
  }
}

export function getAllReports(): { file: string; generated_at: string; ticker_count: number }[] {
  if (!fs.existsSync(resultsDir)) return [];
  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith("-probability-report.json"))
    .sort()
    .reverse();
  return files.map((f) => {
    try {
      const raw = fs.readFileSync(path.join(resultsDir, f), "utf-8");
      const r = JSON.parse(raw) as ProbabilityReport;
      return { file: f, generated_at: r.generated_at, ticker_count: r.tickers.length };
    } catch {
      return { file: f, generated_at: "", ticker_count: 0 };
    }
  });
}

export function getReportByFile(filename: string): ProbabilityReport | null {
  const p = path.join(resultsDir, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ProbabilityReport;
  } catch {
    return null;
  }
}
