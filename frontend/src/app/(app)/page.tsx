import { redirect } from "next/navigation";

import { HomeDashboard } from "@/components/home/HomeDashboard";
import { fetchAsStudent, getStudent } from "@/lib/student-session";
import type { HomeSummary } from "@/types/cie";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { me } = await getStudent();

  // First visit after sign-in: a short, skippable onboarding.
  if (!me.profile.onboarding_completed) {
    redirect("/welcome");
  }

  const home = await fetchAsStudent<HomeSummary>("/me/home");

  return <HomeDashboard home={home} />;
}
