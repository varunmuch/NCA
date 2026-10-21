import type { Metadata } from "next";

import { StaffStudentView } from "@/components/staff/StaffStudentView";
import { fetchAsStaff } from "@/lib/staff";
import type { StaffStudentDetail } from "@/types/cie";

export const metadata: Metadata = { title: "Student" };

export const dynamic = "force-dynamic";

export default async function StaffStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const student = await fetchAsStaff<StaffStudentDetail>(`/students/${encodeURIComponent(id)}`);

  return <StaffStudentView student={student} />;
}
