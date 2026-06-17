# HardZone Payments / AQSI

AQSI is one of the highest-risk parts of the project. Do not change endpoints, payloads, or order-closing rules from memory; always compare code against `swagger (3).json`.

## Sources

- Swagger: `swagger (3).json` is the canonical local AQSI API reference.
- Backend:
  - `backend/src/services/aqsi.js`
  - `backend/src/services/aqsi-v4-flow.js`
  - `backend/src/routes/aqsi-v4.js`
  - `backend/src/routes/orders.js`
  - `backend/src/services/order-sync.js`
- Frontend:
  - `frontend/components/sales/`

## Current Code Shape

There are two AQSI paths in the codebase:

1. Legacy/simple order flow in `backend/src/services/aqsi.js`:
   - `sendOrderToAqsi(order)` uses `POST /v2/Orders/simple`.
   - `getAqsiOrder(orderId)` reads `GET /v2/Orders/simple/{id}` for legacy sync.
   - Refunds currently use `POST /v2/Receipts/returnReceipt`.
   - This path is retained for compatibility with older cash/order/fiscalization code.

2. Current V4 acquiring and receipt flow:
   - `backend/src/routes/aqsi-v4.js` is mounted before `ordersRouter` on `/api/orders`.
   - `backend/src/services/aqsi-v4-flow.js` owns card acquiring, slip polling, receipt creation, recovery, cancellation, and terminal-blocker handling.
   - `backend/src/services/aqsi.js` contains the shared AQSI client and low-level helpers: `startSlipPurchase(...)`, `getOperation(...)`, `cancelOperation(...)`, `sendV4ReceiptRequest(...)`, `buildAqsiV4ReceiptPayload(...)`, `listAqsiReceipts(...)`, `listAqsiSlips(...)`, and `getAqsiSlip(...)`.
   - Cash confirmation in `backend/src/routes/orders.js` still calls `sendOrderToAqsiV4(...)`, which sends a V4 receipt directly with `POST /v4/Receipts/process`.

If UI/payment behavior is changed, treat the V4 flow as the primary path unless the task explicitly says it is touching the legacy v2 flow.

## Main Rules

1. Before changing AQSI endpoint or payload code, compare it with `swagger (3).json`.
2. For re-fiscalizing an already paid but not closed order, use the existing server flow `syncAqsiV4(orderId)`.
3. Do not manually create a fresh receipt if an order already has AQSI payment/receipt operation traces.
4. Do not close an order until the receipt operation is `Completed`.
5. During network uncertainty, preserve operation IDs and AQSI traces instead of clearing fields.

## Receipt Recovery Rules

AQSI receipt recovery must treat card terminal payments and cash receipt processing as one shared fiscalization surface, even though they start from different endpoints.

- Card terminal flow uses `aqsi_payment_operation_id`, `aqsi_slip_id`, and `aqsi_receipt_operation_id`.
- Cash flow uses `aqsi_sent_at` and `aqsi_receipt_operation_id`; it does not have a slip.
- If `aqsi_receipt_operation_id` exists, recovery must check `/v4/Operations/{id}` before creating any new receipt.
- `marking_error` with fiscal data is terminal for payment/order closing: save fiscal data, confirm the order, preserve `aqsi_error`, and keep the receipt operation id for diagnostics.
- `completed` with fiscal data is terminal: save fiscal data, confirm the order, clear transient operation locks.
- Do not retry a receipt endlessly when slip content cannot be recovered. Mark it as `stuck`/manual reconciliation instead.
- A bare `aqsi_receipt_status = 'pending'` without payment/slip/receipt operation traces is not enough for V4 background recovery.
- If a cash send failed with network uncertainty and AQSI later says the order is not found, clear `aqsi_sent_at` only when there is no `aqsi_receipt_operation_id` and no `aqsi_receipt_id`; this unlocks a safe cashier retry.
- Cash V4 receipts must save `aqsi_receipt_id`, fiscal FD/FN/FP, `aqsi_receipt_status`, and `aqsi_receipt_operation_id` before confirming the order.

## V4 Acquiring Flow

UI flow:

```text
card payment -> initiate-payment -> polling sync-slip -> receipt operation -> close order
```

Backend AQSI endpoints:

```text
POST /v4/Slips/process/purchase
GET /v4/Operations/{id}
POST /v4/Receipts/process
GET /v4/Operations/{id}
```

HardZone API endpoints mounted under `/api/orders`:

```text
POST /api/orders/{id}/initiate-payment
POST /api/orders/{id}/sync-slip
POST /api/orders/{id}/sync-aqsi-v4
POST /api/orders/recover-terminal-blocker
POST /api/orders/force-clear-blocker
```

Key order fields:

- `aqsi_payment_operation_id`
- `aqsi_payment_operation_at`
- `aqsi_slip_id`
- `aqsi_receipt_operation_id`
- `aqsi_receipt_id`
- `aqsi_payment_status`
- `aqsi_receipt_status`
- `aqsi_error`

## Marking

- Frontend normalization: `frontend/components/sales/sales-marking-utils.ts`.
- Backend normalization/parsing: `backend/src/routes/orders.js`.
- The V4 flow does not use `itemCode`.
- `nomenclatureCode` is sent as the raw string for V4 receipts.

## Terminal Blockers

Table: `aqsi_terminal_blockers`, migration `034_aqsi_terminal_blockers.sql`.

Purpose: store AQSI operations that block the terminal, including operations that are not always directly tied to the current open order.

Frontend recovery: the cash-register check action calls `recover-terminal-blocker`.

## Dangerous Changes

Treat these as high-risk:

- changes in `buildAqsiV4ReceiptPayload`;
- changes to order-closing conditions after receipt operations;
- clearing `aqsi_*` fields;
- retrying payment/receipt operations;
- changing polling/cancel/recover flow;
- changing discounts and final receipt totals.

For these changes, use staging first and create or confirm a recent production backup before production deploy.

## Payment Regression Tests

AQSI recovery changes must keep the backend payment regression tests green. The focused coverage lives in `backend/test/order-sync.test.js` and checks:

- uncertain cash send unlocks after AQSI "order not found";
- V4 background sync ignores bare pending state without operation traces;
- cash `send-to-aqsi` stores AQSI receipt id and fiscal data from a completed V4 receipt operation.

Because backend tests require PostgreSQL, run them through the remote isolated database path:

```powershell
.\scripts\test-backend-remote.ps1
```
