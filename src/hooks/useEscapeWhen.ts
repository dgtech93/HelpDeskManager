import { useEffect, useRef } from "react";

/**
 * Calls `onEscape` when the Escape key is pressed while `active` is true.
 * Uses a ref for the callback so the listener is not recreated every render.
 */
export function useEscapeWhen(active: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onEscapeRef.current();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [active]);
}
