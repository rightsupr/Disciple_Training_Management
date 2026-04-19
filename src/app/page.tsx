import { CheckinApp } from "@/components/checkin-app";
import { getTodayDateKey } from "@/lib/date";
import { getDashboardData } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const initialDate = getTodayDateKey();
  const initialData = getDashboardData(initialDate);

  return <CheckinApp initialDate={initialDate} initialData={initialData} />;
}
