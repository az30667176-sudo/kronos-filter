import { getAllReports } from "@/lib/report";

export default function HistoryPage() {
  const reports = getAllReports();

  if (reports.length === 0) {
    return (
      <div className="text-center py-24" style={{ color: "var(--text-muted)" }}>
        <p
          className="text-2xl mb-3 font-[family-name:var(--font-playfair)]"
          style={{ color: "var(--text-secondary)" }}
        >
          No history yet
        </p>
        <p className="text-base leading-relaxed">
          Each CLI run creates a timestamped report in <code style={{ color: "var(--accent)" }}>results/</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1
        className="text-2xl font-semibold mb-6 font-[family-name:var(--font-playfair)]"
        style={{ color: "var(--text-primary)" }}
      >
        Analysis History
      </h1>
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th
                className="px-4 py-3 text-left font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Generated at
              </th>
              <th
                className="px-4 py-3 text-left font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                File
              </th>
              <th
                className="px-4 py-3 text-right font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Tickers
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr
                key={r.file}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                  {r.generated_at.slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                  {r.file}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {r.ticker_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
