"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import type { MeResponse } from "@/types/cie";

type StudentContextValue = {
  me: MeResponse;
  email: string;
  refresh: () => Promise<void>;
  setMe: (me: MeResponse) => void;
};

const StudentContext = createContext<StudentContextValue | null>(null);

export function StudentProvider({
  initial,
  email,
  children,
}: {
  initial: MeResponse;
  email: string;
  children: ReactNode;
}) {
  const [me, setMe] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      // Keep the last known profile; pages show their own errors.
    }
  }, []);

  return (
    <StudentContext.Provider value={{ me, email, refresh, setMe }}>
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent() {
  const value = useContext(StudentContext);

  if (!value) {
    throw new Error("useStudent must be used inside StudentProvider.");
  }

  return value;
}

export function initialsFor(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);

  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
