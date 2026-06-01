# HardZone Payments / AQSI

AQSI - самая рискованная часть проекта. Не менять ее "по памяти".

## Источники

- Swagger: `swagger (3).json` - каноничная документация AQSI по кассе и кассовым операциям.
- Backend:
  - `backend/src/services/aqsi.js`
  - `backend/src/services/aqsi-v4-flow.js`
  - `backend/src/routes/aqsi-v4.js`
  - `backend/src/routes/orders.js`
  - `backend/src/services/order-sync.js`
- Frontend:
  - `frontend/components/sales/`

## Главные правила

1. Перед изменением AQSI endpoint или payload сверить `swagger (3).json`.
2. Для повторной фискализации уже оплаченного, но не закрытого заказа использовать существующий серверный flow `syncAqsiV4(orderId)`.
3. Не собирать новый чек вручную, если у заказа уже есть платежный след AQSI.
4. Не закрывать заказ, если receipt operation не `Completed`.
5. При сетевой неопределенности сохранять возможность восстановления, а не стирать все следы операции.

## V4 acquiring flow

UI:

```text
Оплата картой -> initiate-payment -> polling sync-slip -> receipt -> закрытие заказа
```

Backend:

```text
POST /v4/Slips/process/purchase
GET /v4/Operations/{id}
POST /v4/Receipts/process
GET /v4/Operations/{id}
```

Ключевые поля заказа:

- `aqsi_payment_operation_id`
- `aqsi_payment_operation_at`
- `aqsi_slip_id`
- `aqsi_receipt_operation_id`
- `aqsi_receipt_id`
- `aqsi_payment_status`
- `aqsi_receipt_status`
- `aqsi_error`

## Маркировка

- Frontend normalization: `frontend/components/sales/sales-marking-utils.ts`.
- Backend normalization/parsing: `backend/src/routes/orders.js`.
- V4 flow не использует `itemCode`.
- `nomenclatureCode` в v4 передается как raw string.

## Terminal blockers

Таблица: `aqsi_terminal_blockers`, миграция `034_aqsi_terminal_blockers.sql`.

Назначение: хранить операции AQSI, которые блокируют терминал, но не всегда напрямую связаны с текущим открытым заказом.

Frontend recovery: кнопка проверки кассы вызывает `recover-terminal-blocker`.

## Что считать опасными изменениями

- Любые изменения в `buildAqsiV4ReceiptPayload`.
- Изменения условий закрытия заказа после receipt.
- Очистка `aqsi_*` полей.
- Повторная отправка платежа/чека.
- Изменения polling/cancel/recover flow.
- Изменения скидок и итоговых сумм в чеке.
