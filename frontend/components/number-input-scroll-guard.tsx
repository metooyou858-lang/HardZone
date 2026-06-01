"use client";

import { useEffect } from "react";

// Prevents scroll from accidentally changing <input type="number"> values.
// Blurs the input when the user scrolls while it's focused.
export function NumberInputScrollGuard() {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === "number") {
        el.blur();
      }
    }
    document.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    return () => document.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  return null;
}
