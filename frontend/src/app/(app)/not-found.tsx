import { Compass } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-softer text-primary">
        <Compass aria-hidden className="size-6" />
      </span>
      <h1 className="font-display mt-4 text-3xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-ink-muted">It may have been moved or deleted.</p>
      <ButtonLink href="/" className="mt-6">
        Back to Home
      </ButtonLink>
    </div>
  );
}
