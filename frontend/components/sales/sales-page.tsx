"use client";

import { useState } from "react";

import { CatalogPanel } from "@/components/sales/catalog-panel";
import { CheckoutPanel } from "@/components/sales/checkout-panel";
import { ClientPickerModal } from "@/components/sales/client-picker-modal";
import { SalesHistoryPanel } from "@/components/sales/sales-history-panel";
import {
  getBannerClass,
  getClientName,
  getClientSubscriptionLabel,
  searchInputCls,
  type BannerState,
  type SalesTab,
} from "@/components/sales/sales-shared";
import { useSalesCatalog } from "@/components/sales/use-sales-catalog";
import { useSalesHistory } from "@/components/sales/use-sales-history";
import { useSalesOrder } from "@/components/sales/use-sales-order";

export default function SalesPage() {
  const [tab, setTab] = useState<SalesTab>("cash");
  const [banner, setBanner] = useState<BannerState>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const catalogApi = useSalesCatalog({
    enabled: tab === "cash",
    setBanner,
  });

  const orderApi = useSalesOrder({
    cashViewActive: tab === "cash",
    setBanner,
    onHistoryChanged: () => setHistoryRefreshToken((value) => value + 1),
  });

  const historyApi = useSalesHistory({
    enabled: tab === "history",
    externalReloadToken: historyRefreshToken,
    currentOrder: orderApi.order,
    setCurrentOrder: orderApi.setOrder,
    setSelectedClient: orderApi.setSelectedClient,
    setBanner,
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
                  ? "bg-[var(--accent)] text-[#062b26]"
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
                  ? "bg-[var(--accent)] text-[#062b26]"
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
        <div className="grid min-h-[calc(100vh-11rem)] gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
          <CatalogPanel
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
            addCatalogProduct={orderApi.addCatalogProduct}
          />

          <CheckoutPanel
            orderLoading={orderApi.orderLoading}
            order={orderApi.order}
            basketLines={orderApi.basketLines}
            selectedClient={orderApi.selectedClient}
            clientSelectionLocked={orderApi.clientSelectionLocked}
            setClientError={orderApi.setClientError}
            setClientPickerOpen={orderApi.setClientPickerOpen}
            applyClientSelection={orderApi.applyClientSelection}
            clientSaving={orderApi.clientSaving}
            serviceRequiresClient={orderApi.serviceRequiresClient}
            orderClientId={orderApi.orderClientId}
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
            orderAwaitingPayment={orderApi.orderAwaitingPayment}
            sendBlockedByClient={orderApi.sendBlockedByClient}
            sendBlockedByMarking={orderApi.sendBlockedByMarking}
            setMarkingDraftValue={orderApi.setMarkingDraftValue}
            handleConfirm={orderApi.handleConfirm}
            handleStartNewOrder={orderApi.handleStartNewOrder}
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
          cancellingId={historyApi.cancellingId}
          refundingId={historyApi.refundingId}
          syncingOrderId={historyApi.syncingOrderId}
          handleToggleOrder={historyApi.handleToggleOrder}
          handleSyncPayment={historyApi.handleSyncPayment}
          handleCancelOrder={historyApi.handleCancelOrder}
          handleRefundOrder={historyApi.handleRefundOrder}
        />
      )}

      <ClientPickerModal
        open={orderApi.clientPickerOpen}
        query={orderApi.clientQuery}
        error={orderApi.clientError}
        loading={orderApi.clientLoading}
        results={orderApi.clientResults}
        saving={orderApi.clientSaving}
        searchInputClassName={searchInputCls}
        onClose={() => {
          orderApi.setClientPickerOpen(false);
          orderApi.setClientError(null);
        }}
        onQueryChange={orderApi.setClientQuery}
        onKeyDown={orderApi.handleClientSearchKeyDown}
        onSelect={(client) => void orderApi.applyClientSelection(client)}
        getClientName={getClientName}
        getClientSubscriptionLabel={getClientSubscriptionLabel}
      />
    </div>
  );
}
