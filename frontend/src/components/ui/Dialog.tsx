"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { IconButton } from "./Button";

/**
 * Accessible modal built on the native <dialog> element (focus trapping,
 * Escape to close, and inert background come from the browser).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  side = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  side?: "center" | "left";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const position =
    side === "left"
      ? "m-0 h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none rounded-none rounded-r-[var(--radius-hero)]"
      : "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-hero)]";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
      aria-labelledby="dialog-title"
      className={`${position} border border-line bg-surface p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:animate-[var(--animate-fade-in)]`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-bold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X aria-hidden className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
