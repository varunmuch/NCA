"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/Button";

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl font-semibold">Something went sideways</h1>
      <p className="mt-3 text-ink-muted">
        {error.message && !error.digest
          ? error.message
          : "We couldn't load this page. Your information is safe. Please try again."}
      </p>
      <Button className="mt-6" onClick={reset} icon={<RotateCcw aria-hidden className="size-4" />}>
        Try again
      </Button>
    </div>
  );
}
