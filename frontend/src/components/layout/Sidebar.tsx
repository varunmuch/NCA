"use client";

import { BrandLogo } from "./BrandLogo";

type SidebarProps = {
  activeSection: string;
  setActiveSection: (section: string) => void;
};

const navItems = [
  { id: "dashboard", label: "Home" },
  { id: "profile", label: "Profile" },
  { id: "roadmap", label: "Roadmap" },
  { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills" },
  { id: "certifications", label: "Certifications" },
  { id: "interview", label: "Interview Prep" },
  { id: "progress", label: "Progress Tracker" },
];

export function Sidebar({
  activeSection,
  setActiveSection,
}: SidebarProps) {
  function handleClick(sectionId: string) {
    setActiveSection(sectionId);
  }

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 shadow-sm lg:block">
        <div className="mb-7 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-700 p-6 text-white shadow-lg shadow-slate-200">
          <div className="flex items-center gap-4">
            <BrandLogo
              variant="shield"
              size="lg"
              light
              showText={false}
            />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-50">
                NeoCity Academy
              </p>

              <p className="mt-1 text-lg font-bold leading-6 text-white">
                Career Intelligence Engine
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm leading-6 text-slate-100">
            Every Day is Day One!
          </p>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item.id)}
                className={[
                  "flex w-full cursor-pointer items-center rounded-2xl px-4 py-3 text-left text-sm font-semibold",
                  isActive
                    ? "bg-slate-900 text-white shadow-md shadow-slate-200"
                    : "text-slate-600 hover:bg-teal-50 hover:text-teal-800",
                ].join(" ")}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
          {navItems.slice(0, 5).map((item) => {
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item.id)}
                className={[
                  "flex items-center justify-center rounded-2xl px-2 py-3 text-xs font-semibold",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-teal-50 hover:text-teal-800",
                ].join(" ")}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
