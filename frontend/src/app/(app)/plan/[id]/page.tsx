import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { PlanWorkspace } from "@/components/plan/PlanWorkspace";
import { identityFromSession, studentFetch } from "@/lib/cie-server";
import type { PlanDetail } from "@/types/cie";

export const metadata: Metadata = { title: "My Path" };

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = identityFromSession(await auth());

  if (!identity) {
    notFound();
  }

  const response = await studentFetch(identity, `/me/plans/${encodeURIComponent(id)}`);

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error("We couldn't load this plan. Please try again.");
  }

  const plan = (await response.json()) as PlanDetail;

  return <PlanWorkspace key={plan.id} initial={plan} />;
}
