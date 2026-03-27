"use client";

import { useState } from "react";

import { confirmImport, ImportItem, ParseResult, parseImportFile } from "@/lib/api/imports";

export function useImport() {
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  async function parse(file: File) {
    setParsing(true);
    setError(null);
    setParseResult(null);
    setItems([]);

    try {
      const result = await parseImportFile(file);
      setParseResult(result);
      setItems(result.items.map((item) => ({ ...item, skip: false })));
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка парсинга");
    } finally {
      setParsing(false);
    }
  }

  async function confirm(mode: "receipt" | "stock") {
    setConfirming(true);
    setError(null);

    try {
      const response = await confirmImport(items, mode);
      setImported(response.imported);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка импорта");
    } finally {
      setConfirming(false);
    }
  }

  function updateItem(index: number, patch: Partial<ImportItem>) {
    setItems((previous) => previous.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  function reset() {
    setParseResult(null);
    setItems([]);
    setError(null);
    setImported(null);
  }

  return {
    parse,
    confirm,
    updateItem,
    reset,
    parsing,
    confirming,
    parseResult,
    items,
    error,
    imported,
    activeCount: items.filter((item) => !item.skip).length,
  };
}
