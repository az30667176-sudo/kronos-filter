import { getLatestReport } from "@/lib/report";
import { HomeClient } from "./HomeClient";

export default function Home() {
  const initialReport = getLatestReport();
  return <HomeClient initialReport={initialReport} />;
}
