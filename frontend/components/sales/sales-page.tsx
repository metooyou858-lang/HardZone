"use client";

import { useEffect, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { fetchClient } from "@/lib/api/clients";
import type { ClientListItem } from "@/lib/api/clients";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";

import { CatalogPanel } from "@/components/sales/catalog-panel";
import { CheckoutPanel } from "@/components/sales/checkout-panel";
import { SalesHistoryPanel } from "@/components/sales/sales-history-panel";
import {
  getBannerClass,
  type BannerState,
  type SalesTab,
} from "@/components/sales/sales-shared";
import { useSalesCatalog } from "@/components/sales/use-sales-catalog";
import { useSalesHistory } from "@/components/sales/use-sales-history";
import { useSalesOrder } from "@/components/sales/use-sales-order";

export default function SalesPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SalesTab>("cash");
  const [banner, setBanner] = useState<BannerState>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/auth-api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return [];
        const data = (await response.json()) as { data?: { user?: { modules?: AuthModulePermission[] } } };
        return data.data?.user?.modules ?? [];
      })
      .then((modules) => { if (!cancelled) setCurrentModules(modules); })
      .catch(() => { if (!cancelled) setCurrentModules([]); });

    return () => { cancelled = true; };
  }, []);

  const canCreateSales = hasModuleAccess(currentModules, "sales_create");
  const canPaySales = hasModuleAccess(currentModules, "sales_pay");
  const canRefundSales = hasModuleAccess(currentModules, "sales_refund");
  const canRecoverSalesAqsi = hasModuleAccess(currentModules, "sales_aqsi_recovery");

  const catalogApi = useSalesCatalog({
    enabled: tab === "cash",
    setBanner,
  });

  const orderApi = useSalesOrder({
    cashViewActive: tab === "cash",
    canCreateSales,
    canPaySales,
    canRecoverSalesAqsi,
    setBanner,
    onHistoryChanged: () => setHistoryRefreshToken((value) => value + 1),
    onBarcodeScanComplete: () => catalogApi.setQuery(""),
  });

  // Return focus to search after marking code is scanned
  useEffect(() => {
    if (orderApi.pendingMarkingLineKey === null) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [orderApi.pendingMarkingLineKey]);

  useEffect(() => {
    const clientId = searchParams.get("client_id");
    if (!clientId) return;

    fetchClient(clientId)
      .then((client) => {
        orderApi.setSelectedClient(client as unknown as ClientListItem);
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const historyApi = useSalesHistory({
    enabled: tab === "history",
    externalReloadToken: historyRefreshToken,
    currentOrder: orderApi.order,
    setCurrentOrder: orderApi.setOrder,
    setSelectedClient: orderApi.setSelectedClient,
    setBanner,
    canRefundSales,
    canRecoverSalesAqsi,
    onCatalogChanged: catalogApi.reloadCatalog,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)]">
            Продажи
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1">
            <button
              type="button"
              onClick={() => setTab("cash")}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                tab === "cash"
                  ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Касса
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                tab === "history"
                  ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              История
            </button>
          </div>

          {tab === "cash" && orderApi.order && (
            <div className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2 text-xs text-[var(--text-muted)]">
              Чек #{orderApi.order.id.slice(0, 8)}
            </div>
          )}
        </div>
      </div>

      {banner && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${getBannerClass(banner.tone)}`}>
          {banner.text}
        </div>
      )}

      {tab === "cash" ? (
        <div className="grid gap-4 xl:h-[calc(100vh-11rem)] xl:min-h-[640px] xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] xl:overflow-hidden">
          <CatalogPanel
            searchInputRef={searchInputRef}
            query={catalogApi.query}
            setQuery={catalogApi.setQuery}
            catalogGroups={catalogApi.catalogGroups}
            selectedCatalogGroup={catalogApi.selectedCatalogGroup}
            setSelectedCatalogGroup={catalogApi.setSelectedCatalogGroup}
            catalogGroupsLoading={catalogApi.catalogGroupsLoading}
            catalogLoading={catalogApi.catalogLoading}
            catalog={catalogApi.catalog}
            lineBusyKey={orderApi.lineBusyKey}
            orderLoading={orderApi.orderLoading}
            orderLocked={orderApi.orderLocked}
            canCreateSales={canCreateSales}
            addCatalogProduct={orderApi.addCatalogProduct}
          />

          <CheckoutPanel
            orderLoading={orderApi.orderLoading}
            order={orderApi.order}
            basketLines={orderApi.basketLines}
            selectedClient={orderApi.selectedClient}
            clientSelectionLocked={orderApi.clientSelectionLocked}
            clientSaving={orderApi.clientSaving}
            serviceRequiresClient={orderApi.serviceRequiresClient}
            orderClientId={orderApi.orderClientId}
            clientPickerOpen={orderApi.clientPickerOpen}
            setClientPickerOpen={orderApi.setClientPickerOpen}
            clientQuery={orderApi.clientQuery}
            setClientQuery={orderApi.setClientQuery}
            clientResults={orderApi.clientResults}
            clientLoading={orderApi.clientLoading}
            clientError={orderApi.clientError}
            setClientError={orderApi.setClientError}
            handleClientSearchKeyDown={orderApi.handleClientSearchKeyDown}
            applyClientSelection={orderApi.applyClientSelection}
            lineBusyKey={orderApi.lineBusyKey}
            orderLocked={orderApi.orderLocked}
            editingLineDiscountKey={orderApi.editingLineDiscountKey}
            lineDiscountMode={orderApi.lineDiscountMode}
            setLineDiscountMode={orderApi.setLineDiscountMode}
            lineDiscountValue={orderApi.lineDiscountValue}
            setLineDiscountValue={orderApi.setLineDiscountValue}
            lineDiscountSavingKey={orderApi.lineDiscountSavingKey}
            markingSavingKey={orderApi.markingSavingKey}
            openLineDiscountEditor={orderApi.openLineDiscountEditor}
            removeLine={orderApi.removeLine}
            decrementLine={orderApi.decrementLine}
            incrementLine={orderApi.incrementLine}
            saveLineDiscount={orderApi.saveLineDiscount}
            setEditingLineDiscountKey={orderApi.setEditingLineDiscountKey}
            receiptDiscountMode={orderApi.receiptDiscountMode}
            receiptDiscountValue={orderApi.receiptDiscountValue}
            scheduleReceiptDiscount={orderApi.scheduleReceiptDiscount}
            receiptDiscountSaving={orderApi.receiptDiscountSaving}
            hasAnyDiscount={orderApi.hasAnyDiscount}
            basketGrossTotal={orderApi.basketGrossTotal}
            basketLineDiscountTotal={orderApi.basketLineDiscountTotal}
            orderLevelDiscount={orderApi.orderLevelDiscount}
            markingDrafts={orderApi.markingDrafts}
            confirming={orderApi.confirming}
            sendBlockedByClient={orderApi.sendBlockedByClient}
            sendBlockedByMarking={orderApi.sendBlockedByMarking}
            setMarkingDraftValue={orderApi.setMarkingDraftValue}
            handleConfirmCash={orderApi.handleConfirmCash}
            handleInitiatePayment={orderApi.handleInitiatePayment}
            handleSyncV4={orderApi.handleSyncV4}
            receiptError={orderApi.receiptError}
            conflictingOperationId={orderApi.conflictingOperationId}
            slipPending={orderApi.slipPending}
            paymentBusy={orderApi.paymentBusy}
            canCreateSales={canCreateSales}
            canPaySales={canPaySales}
            canRecoverSalesAqsi={canRecoverSalesAqsi}
            pendingMarkingLineKey={orderApi.pendingMarkingLineKey}
            onMarkingScanned={orderApi.clearPendingMarkingLineKey}
            onMarkingFieldFocusChange={orderApi.setMarkingFieldActive}
          />
        </div>
      ) : (
        <SalesHistoryPanel
          historyFilter={historyApi.historyFilter}
          setHistoryFilter={historyApi.setHistoryFilter}
          historyError={historyApi.historyError}
          historyLoading={historyApi.historyLoading}
          orders={historyApi.orders}
          expandedOrderId={historyApi.expandedOrderId}
          orderDetails={historyApi.orderDetails}
          detailLoadingId={historyApi.detailLoadingId}
          refundingId={historyApi.refundingId}
          syncingOrderId={historyApi.syncingOrderId}
          handleToggleOrder={historyApi.handleToggleOrder}
          handleSyncPayment={historyApi.handleSyncPayment}
          handleRefundOrder={historyApi.handleRefundOrder}
          canRefundSales={canRefundSales}
          canRecoverSalesAqsi={canRecoverSalesAqsi}
        />
      )}

    </div>
  );
}
