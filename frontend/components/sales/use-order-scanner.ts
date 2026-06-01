"use client";

import { useEffect, useRef } from "react";

import { normalizeScannerLayout } from "@/components/sales/sales-marking-utils";

type UseOrderScannerOptions = {
  /** Activate the global keydown listener (cash tab open, picker closed). */
  enabled: boolean;
  onScan: (barcode: string) => void;
};

/**
 * Global barcode scanner listener.
 * Detects scanner input: 6+ characters arriving within 100ms followed by Enter.
 * Keyboard layout is normalised from Russian to Latin before the callback fires.
 */
export function useOrderScanner({ enabled, onScan }: UseOrderScannerOptions) {
  const bufferRef = useRef("");
  const lastTsRef = useRef(0);
  // Set to true while the marking input has focus so scanner input isn't intercepted
  const markingFieldActiveRef = useRef(false);

  function setMarkingFieldActive(active: boolean) {
    markingFieldActiveRef.current = active;
  }

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (markingFieldActiveRef.current) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const now = Date.now();

      if (event.key === "Enter") {
        const barcode = bufferRef.current.trim();
        const isScannerInput = barcode.length >= 6 && now - lastTsRef.current <= 100;
        bufferRef.current = "";
        lastTsRef.current = 0;

        if (isScannerInput) {
          event.preventDefault();
          onScan(normalizeScannerLayout(barcode));
        }
        return;
      }

      if (event.key.length === 1) {
        if (now - lastTsRef.current > 100) bufferRef.current = "";
        bufferRef.current += event.key;
        lastTsRef.current = now;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onScan]);

  return { setMarkingFieldActive };
}
