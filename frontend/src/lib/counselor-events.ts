/**
 * Any part of the app can hand a question to the floating counselor:
 * askCounselor("Why is UCF in my plan?") opens the widget and sends it.
 * askCounselor() with no text just opens it.
 */
export const ASK_EVENT = "cie:ask-counselor";

export function askCounselor(text = "") {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: text }));
}
