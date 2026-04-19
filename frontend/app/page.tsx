import { getLatestReport } from "@/lib/report";
import { PredictForm } from "./PredictForm";
import { Dashboard } from "./Dashboard";

export default function Home() {
  const report = getLatestReport();

  return (
    <div>
      <PredictForm />
      {report ? (
        <Dashboard report={report} />
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
          <p className="text-sm">Run the command above to generate your first report.</p>
        </div>
      )}
    </div>
  );
}
