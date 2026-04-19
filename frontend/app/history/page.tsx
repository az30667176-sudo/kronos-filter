import Link from "next/link";
import { getAllReports } from "@/lib/report";

function formatLocalTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
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

export default function HistoryPage() {
  const reports = getAllReports();

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
          Database · {reports.length} runs
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Prediction <span className="gradient-text">history</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Every prediction run is timestamped and stored. Click any row to view the full report.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
          <p className="text-xl mb-2" style={{ color: "var(--text-secondary)" }}>
            No runs yet
          </p>
          <p className="text-sm">
            Generate a command on the{" "}
            <Link href="/" style={{ color: "var(--accent)" }} className="underline">
              Predict
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                <th
                  className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Timestamp
                </th>
                <th
                  className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tickers
                </th>
                <th
                  className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Model
                </th>
                <th
                  className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Samples
                </th>
                <th
                  className="px-4 py-3 text-right font-medium text-xs uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Pred
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr
                  key={r.file}
                  className="transition-colors hover:opacity-95"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: i === 0 ? "rgba(0, 217, 255, 0.03)" : "transparent",
                  }}
                >
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/run/${r.id}`}
                      className="inline-flex flex-col cursor-pointer"
                    >
                      <span className="mono text-sm" style={{ color: "var(--text-primary)" }}>
                        {formatLocalTime(r.generated_at)}
                      </span>
                      <span className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {relativeTime(r.generated_at)}
                        {i === 0 && (
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
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {r.tickers.slice(0, 8).map((t) => (
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
                      {r.tickers.length > 8 && (
                        <span className="text-xs self-center" style={{ color: "var(--text-muted)" }}>
                          +{r.tickers.length - 8}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3.5 text-right mono text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {r.model}
                  </td>
                  <td
                    className="px-4 py-3.5 text-right mono text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {r.samples}
                  </td>
                  <td
                    className="px-4 py-3.5 text-right mono text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {r.pred_len}
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
