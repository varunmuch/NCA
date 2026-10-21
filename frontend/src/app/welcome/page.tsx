import type { Metadata } from "next";

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { getStudent } from "@/lib/student-session";

export const metadata: Metadata = { title: "Welcome" };

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { me } = await getStudent();

  return <OnboardingFlow profile={me.profile} />;
}
