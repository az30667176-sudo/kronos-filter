import { HistoryClient } from "./HistoryClient";

// Client-side Supabase query (needs browser env vars)
export const dynamic = "force-dynamic";

export default function HistoryPage() {
  return <HistoryClient />;
}
