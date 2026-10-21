import type { Metadata } from "next";

import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { fetchAsStaff } from "@/lib/staff";
import type { StaffStudentRow } from "@/types/cie";

export const metadata: Metadata = { title: "Counselor Dashboard" };

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { students } = await fetchAsStaff<{ students: StaffStudentRow[] }>("/students");

  return <StaffDashboard students={students} />;
}
