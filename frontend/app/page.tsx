import { getLatestReport } from "@/lib/report";
import { Dashboard } from "./Dashboard";

export default function Home() {
  const report = getLatestReport();

  if (!report) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        <p
          className="text-2xl mb-3 font-[family-name:var(--font-playfair)]"
          style={{ color: "var(--text-secondary)" }}
        >
          No analysis yet
        </p>
        <p className="text-base leading-relaxed">
          Run <code style={{ color: "var(--accent)" }}>python main.py --tickers AAPL,MSFT,NVDA</code> to
          generate your first probability report.
        </p>
      </div>
    );
  }

  return <Dashboard report={report} />;
}
