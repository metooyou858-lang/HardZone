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
   - This path is retained for compatibility with older order/fiscalization code.

2. Current V4 acquiring and receipt flow:
   - `backend/src/routes/aqsi-v4.js`
   - `backend/src/services/aqsi-v4-flow.js`
   - `sendOrderToAqsiV4(...)`, `processPaymentSlip(...)`, `pollOperation(...)`, receipt helpers in `backend/src/services/aqsi.js`.

If UI/payment behavior is changed, treat the V4 flow as the primary path unless the task explicitly says it is touching the legacy v2 flow.

## Main Rules

1. Before changing AQSI endpoint or payload code, compare it with `swagger (3).json`.
2. For re-fiscalizing an already paid but not closed order, use the existing server flow `syncAqsiV4(orderId)`.
3. Do not manually create a fresh receipt if an order already has AQSI payment/receipt operation traces.
4. Do not close an order until the receipt operation is `Completed`.
5. During network uncertainty, preserve operation IDs and AQSI traces instead of clearing fields.

## V4 Acquiring Flow

UI flow:

```text
card payment -> initiate-payment -> polling sync-slip -> receipt -> close order
```

Backend AQSI endpoints:

```text
POST /v4/Slips/process/purchase
GET /v4/Operations/{id}
POST /v4/Receipts/process
GET /v4/Operations/{id}
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
