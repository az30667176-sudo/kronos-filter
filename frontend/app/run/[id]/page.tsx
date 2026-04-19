import Link from "next/link";
import { notFound } from "next/navigation";
import { getReportById, getAllReportIds } from "@/lib/report";
import { Dashboard } from "../../Dashboard";

export function generateStaticParams() {
  return getAllReportIds().map((id) => ({ id }));
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = getReportById(id);
  if (!report) notFound();

  return (
    <div>
      <nav className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
        <Link href="/history" style={{ color: "var(--accent)" }} className="hover:underline">
          ← All runs
        </Link>
      </nav>
      <Dashboard report={report} />
    </div>
  );
}
