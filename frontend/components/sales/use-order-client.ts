"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";

import { type ClientListItem, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import { updateOrder, type OrderDetail } from "@/lib/api/orders";
import type { BannerState } from "@/components/sales/sales-shared";

type UseOrderClientOptions = {
  order: OrderDetail | null;
  orderAwaitingPayment: boolean;
  setBanner: Dispatch<SetStateAction<BannerState>>;
  onOrderUpdate: (updater: (prev: OrderDetail | null) => OrderDetail | null) => void;
};

export function useOrderClient({
  order,
  orderAwaitingPayment,
  setBanner,
  onOrderUpdate,
}: UseOrderClientOptions) {
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientListItem[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const scannerBufferRef = useRef("");
  const scannerLastTsRef = useRef(0);

  async function applyClientSelection(nextClient: ClientListItem | null) {
    setClientError(null);

    if (!order || orderAwaitingPayment) {
      setSelectedClient(nextClient);
      setClientPickerOpen(false);
      setClientQuery("");
      return;
    }

    setClientSaving(true);

    try {
      const updatedOrder = await updateOrder(order.id, {
        client_id: nextClient?.id ?? null,
      });
      onOrderUpdate((prev) => (prev ? { ...prev, ...updatedOrder } : prev));
      setSelectedClient(nextClient);
      setClientPickerOpen(false);
      setClientQuery("");
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : "Не удалось сохранить клиента в чеке"
      );
    } finally {
      setClientSaving(false);
    }
  }

  async function handleClientBarcodeScan(barcode: string) {
    setClientError(null);
    setClientLoading(true);

    try {
      const client = await findClientByBarcode(barcode);
      await applyClientSelection(client);
    } catch (error) {
      setClientError(
        error instanceof Error ? error.message : `Клиент по штрихкоду ${barcode} не найден`
      );
    } finally {
      setClientLoading(false);
    }
  }

  function handleClientSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

    const now = Date.now();

    if (event.key === "Enter") {
      const barcode = scannerBufferRef.current.trim();
      const isScannerInput = barcode.length >= 6 && now - scannerLastTsRef.current <= 100;
      scannerBufferRef.current = "";
      scannerLastTsRef.current = 0;

      if (isScannerInput) {
        event.preventDefault();
        void handleClientBarcodeScan(barcode);
      }
      return;
    }

    if (event.key.length === 1) {
      if (now - scannerLastTsRef.current > 100) scannerBufferRef.current = "";
      scannerBufferRef.current += event.key;
      scannerLastTsRef.current = now;
    }
  }

  useEffect(() => {
    if (!clientPickerOpen) return;

    let cancelled = false;
    const trimmedQuery = clientQuery.trim();

    const timer = window.setTimeout(async () => {
      setClientLoading(true);
      setClientError(null);

      try {
        const nextClients = await fetchClients({
          search: trimmedQuery || undefined,
          limit: 20,
        });
        if (!cancelled) setClientResults(nextClients);
      } catch (error) {
        if (!cancelled) {
          setClientError(
            error instanceof Error ? error.message : "Не удалось загрузить клиентов"
          );
        }
      } finally {
        if (!cancelled) setClientLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientPickerOpen, clientQuery]);

  function reset() {
    setSelectedClient(null);
    setClientPickerOpen(false);
    setClientQuery("");
    setClientResults([]);
    setClientError(null);
  }

  return {
    selectedClient,
    setSelectedClient,
    clientPickerOpen,
    setClientPickerOpen,
    clientQuery,
    setClientQuery: (value: string) => {
      setClientError(null);
      setClientQuery(value);
    },
    clientResults,
    clientLoading,
    clientSaving,
    clientError,
    setClientError,
    applyClientSelection,
    handleClientSearchKeyDown,
    reset,
  };
}
