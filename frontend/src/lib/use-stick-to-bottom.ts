"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Keeps a chat pinned to the newest message while a reply streams in, but
 * lets go the moment the student scrolls up to reread, so the reply keeps
 * writing without dragging them back down. Following resumes when they
 * scroll back to the bottom, send a message, or tap "Latest".
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, mounted: unknown = true) {
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let touchY = 0;
    const release = () => {
      following.current = false;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        release();
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      // A finger moving down the screen scrolls the chat up.
      if ((event.touches[0]?.clientY ?? 0) > touchY + 4) {
        release();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
        release();
      }
    };
    // Dragging the scrollbar: any pointer press on the scroll area that isn't on content.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === element) {
        release();
      }
    };
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;

      if (distance < 8) {
        following.current = true;
      }

      setShowJump(distance > 300);
    };

    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("keydown", onKey);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("keydown", onKey);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("scroll", onScroll);
    };
    // `mounted` re-attaches when the scroll area appears (the widget opening).
  }, [ref, mounted]);

  /** Scroll to the newest message if following (or always, when forced). */
  const follow = useCallback(
    (force = false) => {
      const element = ref.current;

      if (!element) {
        return;
      }

      if (force) {
        following.current = true;
      }

      if (following.current) {
        // Instant, not smooth: a smooth animation per streamed word fights the student's own scrolling.
        element.scrollTop = element.scrollHeight;
      }
    },
    [ref]
  );

  const jumpToLatest = useCallback(() => {
    following.current = true;
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [ref]);

  return { follow, jumpToLatest, showJump };
}
