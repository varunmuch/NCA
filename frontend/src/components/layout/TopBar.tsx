import { BrandLogo } from "./BrandLogo";

type TopBarProps = {
  displayName: string;
  targetRole: string;
};

export function TopBar({
  displayName,
  targetRole,
}: TopBarProps) {
  const safeDisplayName = displayName.trim() || "Student";
  const safeTargetRole = targetRole.trim() || "Not set yet";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-5">
          <div className="hidden sm:block">
            <BrandLogo
              variant="horizontal"
              size="lg"
              showText={false}
            />
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700">
              Career Intelligence Engine
            </p>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              Welcome back, {safeDisplayName}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="text-[11px] font-medium text-slate-500">
              Target Role
            </p>

            <p className="text-xs font-semibold text-slate-900">
              {safeTargetRole}
            </p>
          </div>

          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-3 py-1.5">
            <p className="text-[11px] font-medium text-teal-600">
              Profile
            </p>

            <p className="text-xs font-semibold text-teal-700">
              Saved Securely
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
