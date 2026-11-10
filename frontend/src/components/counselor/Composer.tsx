"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, SendHorizontal } from "lucide-react";

export type ComposerHandle = {
  setText: (text: string) => void;
  focus: () => void;
};

export const Composer = forwardRef<
  ComposerHandle,
  {
    onSend: (text: string) => void;
    onAttach: () => void;
    disabled: boolean;
    initialText?: string;
  }
>(function Composer({ onSend, onAttach, disabled, initialText = "" }, ref) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setText: (value: string) => {
      setText(value);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    focus: () => textareaRef.current?.focus(),
  }));

  // Grow with the content up to a comfortable maximum.
  useEffect(() => {
    const element = textareaRef.current;

    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
    }
  }, [text]);

  function submit() {
    const value = text.trim();

    if (!value || disabled) {
      return;
    }

    onSend(value);
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-[1.75rem] border-2 border-primary/15 bg-surface p-2 shadow-[var(--shadow-raised)] transition-colors focus-within:border-primary/45"
    >
      <button
        type="button"
        onClick={onAttach}
        aria-label="Attach a resume or transcript"
        title="Attach a resume or transcript"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sun-soft text-sun transition-colors hover:bg-sun hover:text-white"
      >
        <Paperclip aria-hidden className="size-5" />
      </button>
      <label htmlFor="composer" className="sr-only">
        Message your counselor
      </label>
      <textarea
        id="composer"
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask anything about careers, classes, or your plans…"
        maxLength={4000}
        className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent py-2 leading-relaxed text-ink placeholder:text-ink-soft focus:outline-none focus-visible:outline-none"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        aria-label="Send message"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-[filter,opacity] hover:brightness-110 disabled:from-surface-3 disabled:to-surface-3 disabled:text-ink-soft"
      >
        <SendHorizontal aria-hidden className="size-5" />
      </button>
    </form>
  );
});
