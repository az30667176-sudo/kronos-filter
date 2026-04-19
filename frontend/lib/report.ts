import fs from "fs";
import path from "path";
import type { ProbabilityReport } from "@/types";

const resultsDir = path.join(process.cwd(), "..", "results");

export interface ReportSummary {
  file: string;
  id: string; // filename without .json suffix, used as URL slug
  generated_at: string;
  data_last_date: string | null;
  ticker_count: number;
  tickers: string[];
  model: string;
  samples: number;
  pred_len: number;
}

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

export function getAllReports(): ReportSummary[] {
  if (!fs.existsSync(resultsDir)) return [];
  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith("-probability-report.json"))
    .sort()
    .reverse();
  return files.map((f): ReportSummary => {
    try {
      const raw = fs.readFileSync(path.join(resultsDir, f), "utf-8");
      const r = JSON.parse(raw) as ProbabilityReport;
      return {
        file: f,
        id: f.replace(".json", ""),
        generated_at: r.generated_at,
        data_last_date: r.data_last_date,
        ticker_count: r.tickers.length,
        tickers: r.tickers.map((t) => t.ticker),
        model: r.config.model_size,
        samples: r.config.samples,
        pred_len: r.config.pred_len,
      };
    } catch {
      return {
        file: f,
        id: f.replace(".json", ""),
        generated_at: "",
        data_last_date: null,
        ticker_count: 0,
        tickers: [],
        model: "",
        samples: 0,
        pred_len: 0,
      };
    }
  });
}

export function getReportById(id: string): ProbabilityReport | null {
  const filename = id.endsWith(".json") ? id : `${id}.json`;
  const p = path.join(resultsDir, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ProbabilityReport;
  } catch {
    return null;
  }
}

export function getAllReportIds(): string[] {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith("-probability-report.json"))
    .map((f) => f.replace(".json", ""));
}
