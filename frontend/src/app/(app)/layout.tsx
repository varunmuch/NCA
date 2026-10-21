import { AppShell } from "@/components/layout/AppShell";
import { getStudent } from "@/lib/student-session";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { me, email } = await getStudent();

  return (
    <AppShell me={me} email={email}>
      {children}
    </AppShell>
  );
}
