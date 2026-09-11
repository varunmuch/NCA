import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

type AppShellProps = {
  activeSection: string;
  setActiveSection: (section: string) => void;
  displayName: string;
  targetRole: string;
  children: React.ReactNode;
};

export function AppShell({
  activeSection,
  setActiveSection,
  displayName,
  targetRole,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />

      <section className="min-h-screen pb-24 lg:ml-72 lg:pb-0">
        <TopBar
          displayName={displayName}
          targetRole={targetRole}
        />

        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </section>
    </main>
  );
}
