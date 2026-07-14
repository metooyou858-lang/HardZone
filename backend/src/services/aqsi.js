const axios = require('axios');
const { randomUUID } = require('crypto');
const logger = require('./logger');

const AQSI_RECEIPT_TYPE_SELL = 1;
const DEFAULT_SHIFT_STATUS_CACHE_MS = 30 * 60 * 1000;

let aqsiShiftStatusCache = null;

function getHeaders() {
  return {
    'x-client-key': `Application ${process.env.AQSI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function asAmount(value) {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveDiscountMoney(baseAmount, discountPercent, discountMoney) {
  const safeBase = Math.max(0, asAmount(baseAmount));
  const fixedMoney = Math.max(0, asAmount(discountMoney));
  const percent = Math.max(0, asAmount(discountPercent));
  const rawDiscount = fixedMoney > 0 ? fixedMoney : safeBase * (percent / 100);

  return Math.min(safeBase, rawDiscount);
}

function resolveItemGrossTotal(item) {
  if (item.total !== null && item.total !== undefined) {
    return asAmount(item.total);
  }

  return asAmount(item.sale_price) * asAmount(item.quantity);
}

function resolveItemDiscountMoney(item) {
  return resolveDiscountMoney(
    resolveItemGrossTotal(item),
    item.discount_percent,
    item.discount_money
  );
}

function calculateItemsNetTotal(items) {
  return items.reduce((sum, item) => {
    const gross = resolveItemGrossTotal(item);
    const discount = resolveItemDiscountMoney(item);
    return sum + Math.max(0, gross - discount);
  }, 0);
}

function resolvePaymentSubjectType(item) {
  if (item.kind !== 'product') {
    return 4;
  }

  return item.marking_required || item.marking_code ? 33 : 1;
}

function buildAqsiOrderPayload(order) {
  return {
    id: String(order.id),
    number: String(order.id).slice(0, 8),
    dateTime: new Date().toISOString(),
    shop: String(process.env.AQSI_SHOP_ID),
    content: {
      // aQsi: 1 = Приход, 2 = Возврат прихода, 3 = Расход, 4 = Возврат расхода.
      type: AQSI_RECEIPT_TYPE_SELL,
      discountMoney: asAmount(order.discount_money),
      discountPercent: asAmount(order.discount_percent),
      positions: order.items.map((item) => ({
        positionId: randomUUID(),
        text: item.name,
        quantity: item.quantity,
        price: asAmount(item.sale_price),
        tax: 6,
        paymentMethodType: 4,
        paymentSubjectType: resolvePaymentSubjectType(item),
        unitOfMeasurement: 'Piece',
        unitCode: 0,
        addingType: 1,
        editable: false,
        discountMoney: resolveItemDiscountMoney(item),
        itemCode: item.marking_code || null,
        nomenclatureCode: item.marking_code
          ? Buffer.from(item.marking_code).toString('base64')
          : null,
        markingType: item.marking_code ? (item.marking_type || null) : null,
      })),
      checkClose: {
        taxationSystem: 1,
      },
    },
    isEditableByDevice: true,
  };
}

async function aqsiRequest(method, path, options = {}) {
  try {
    const response = await axios({
      method,
      url: `${process.env.AQSI_BASE_URL}${path}`,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
      params: options.params,
      data: options.data,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const payload =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      const wrapped = new Error(payload);
      wrapped.isAqsiRejection = true;
      throw wrapped;
    }
    throw error;
  }
}

function getShiftStatusCacheMs() {
  const raw = Number(process.env.AQSI_SHIFT_STATUS_CACHE_MS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 8 * 60 * 60 * 1000) {
    return Math.round(raw);
  }

  return DEFAULT_SHIFT_STATUS_CACHE_MS;
}

function buildShiftStatus(rows) {
  const shifts = Array.isArray(rows) ? rows : [];
  const openShift = shifts.find((shift) => shift?.startDate && !shift?.dateClose);

  return {
    known: true,
    open: Boolean(openShift),
    checked_at: new Date().toISOString(),
    shift: openShift
      ? {
          id: openShift.id ?? null,
          number: openShift.number ?? null,
          startDate: openShift.startDate ?? null,
          updatedAt: openShift.updatedAt ?? null,
        }
      : null,
  };
}

async function getAqsiShiftStatus({ force = false } = {}) {
  const cacheMs = getShiftStatusCacheMs();
  const now = Date.now();

  if (
    !force &&
    aqsiShiftStatusCache &&
    aqsiShiftStatusCache.status.open === true &&
    cacheMs > 0 &&
    now - aqsiShiftStatusCache.cachedAtMs <= cacheMs
  ) {
    return { ...aqsiShiftStatusCache.status, cached: true };
  }

  const endDate = new Date();
  const beginDate = new Date(endDate.getTime() - 36 * 60 * 60 * 1000);
  const deviceId = Number(process.env.AQSI_DEVICE_ID || 705334);

  try {
    const response = await aqsiRequest('get', '/v2/Shifts', {
      params: {
        pageSize: 5,
        page: 0,
        'filtered.beginDate': beginDate.toISOString(),
        'filtered.endDate': endDate.toISOString(),
        'filtered.devices': [deviceId],
      },
    });
    const status = buildShiftStatus(response?.rows);
    aqsiShiftStatusCache = { cachedAtMs: now, status };
    return { ...status, cached: false };
  } catch (error) {
    const status = {
      known: false,
      open: null,
      checked_at: new Date().toISOString(),
      shift: null,
      error: error.message,
    };
    logger.warn('aqsi', { action: 'shift_status_check_failed', message: error.message });
    return { ...status, cached: false };
  }
}

async function ensureAqsiShiftOpen(options = {}) {
  const status = await getAqsiShiftStatus(options);

  if (status.known && !status.open) {
    const err = new Error('Смена на кассе не открыта. Откройте смену на aQsi и повторите оплату.');
    err.statusCode = 409;
    err.isAqsiShiftClosed = true;
    err.shiftStatus = status;
    throw err;
  }

  return status;
}

async function sendOrderToAqsi(order) {
  const body = buildAqsiOrderPayload(order);

  const markedItems = (order.items || []).filter((i) => i.marking_code);
  logger.info('aqsi', {
    action: 'send_order',
    order_id: order.id,
    items_count: (order.items || []).length,
    item_code_sent: false,
    marked_items: markedItems.map((i) => ({
      name: i.name,
      code: i.marking_code,
      code_hex: i.marking_code ? Buffer.from(i.marking_code).toString('hex') : null,
      nomenclature_code: i.marking_code ? Buffer.from(i.marking_code).toString('base64') : null,
      has_gs: i.marking_code ? i.marking_code.includes('\x1d') : false,
    })),
  });

  try {
    const result = await aqsiRequest('post', '/v2/Orders/simple', { data: body });
    logger.info('aqsi', { action: 'send_order_ok', order_id: order.id, guid: result?.guid ?? result?.id });
    return result;
  } catch (error) {
    logger.error('aqsi', { action: 'send_order_fail', order_id: order.id, message: error.message });
    throw error;
  }
}

function mapPaymentTypeToAqsi(paymentType) {
  return paymentType === 'cash' ? 0 : 1;
}

async function sendRefundToAqsi(order, items, amountOverride) {
  const body = {
    fiscalDocumentNumber: Number(order.fiscal_fd),
    fiscalStorageNumber: order.fiscal_fn,
    fiscalDocumentAttribute: Number(order.fiscal_fp),
    kktRegId: order.fiscal_kkt_reg,
    dateTime: order.fiscal_date,
    positions: items.map((item) => ({
      positionId: randomUUID(),
      text: item.name,
      quantity: item.quantity,
      price: asAmount(item.sale_price),
      tax: 6,
      paymentMethodType: 4,
      paymentSubjectType: resolvePaymentSubjectType(item),
      unitOfMeasurement: 'Piece',
      unitCode: 0,
      discountMoney: resolveItemDiscountMoney(item),
      itemCode: item.marking_code || null,
      nomenclatureCode: item.marking_code
        ? Buffer.from(item.marking_code).toString('base64')
        : null,
      markingType: item.marking_code ? (item.marking_type || null) : null,
    })),
    checkClose: {
      payments: [
        {
          type: mapPaymentTypeToAqsi(order.payment_type),
          amount:
            amountOverride === undefined
              ? calculateItemsNetTotal(items)
              : asAmount(amountOverride),
        },
      ],
      taxationSystem: 1,
    },
  };

  return aqsiRequest('post', '/v2/Receipts/returnReceipt', { data: body });
}

function buildAqsiV4ReceiptPayload(order, paymentType, slipId = null, slipContent = null) {
  if (slipId && !slipContent) {
    throw new Error('AQSI v4 receipt requires slip.content when slip.id is provided');
  }

  // order.total_amount is the authoritative total (already reflects all discounts incl. order-level).
  // Distribute it across positions proportionally, assigning remainder to the last item.
  const totalAmountKopeks = Math.round(parseFloat(order.total_amount || 0) * 100);

  const itemNetTotals = order.items.map((item) => {
    const gross = resolveItemGrossTotal(item);
    const discount = resolveItemDiscountMoney(item);
    return Math.max(0, gross - discount);
  });
  const itemSubtotal = itemNetTotals.reduce((sum, t) => sum + t, 0);

  let assignedKopeks = 0;
  const positions = order.items.map((item, idx) => {
    const qty = asAmount(item.quantity);
    const isLast = idx === order.items.length - 1;

    let finalPriceKopeks;
    if (isLast) {
      const remainder = totalAmountKopeks - assignedKopeks;
      finalPriceKopeks = qty > 0 ? Math.round(remainder / qty) : 0;
    } else {
      const share = itemSubtotal > 0
        ? totalAmountKopeks * itemNetTotals[idx] / itemSubtotal
        : totalAmountKopeks / order.items.length;
      finalPriceKopeks = qty > 0 ? Math.round(share / qty) : 0;
      assignedKopeks += finalPriceKopeks * qty;
    }

    const info = {
      name: item.name,
      baseQuantity: String(item.quantity),
      finalPrice: finalPriceKopeks,
      taxRateId: 6,
      calculationTypeId: 4,
      calculationSubjectId: resolvePaymentSubjectType(item),
      quantityUnitId: 0,
    };

    if (item.marking_code) {
      // v4 swagger: "формат распознаётся автоматически" — pass raw string, not base64
      info.nomenclatureCode = item.marking_code;
    }

    const position = { info };
    if (item.marking_code && item.marking_type) {
      position.markingType = item.marking_type;
    }

    return position;
  });

  return {
    deviceId: Number(process.env.AQSI_DEVICE_ID || 705334),
    typeId: 1,
    ignoreItemCodeCheck: false,
    skipPrinting: false,
    // v4 taxSystemCode bitmask: 1=ОСН, 2=УСН доход, 4=УСН доход-расход, 32=Патент
    // v2 taxationSystem uses sequential: 1=ОСН — but v2 terminal ignores it anyway
    info: { taxSystemCode: 2 },
    payments: [{
      type: paymentType === 'cash' ? 0 : 1,
      amount: totalAmountKopeks,
      ...(slipId ? { slip: { id: slipId, ...(slipContent ? { content: slipContent } : {}) } } : {}),
    }],
    positions,
  };
}

async function sendOrderToAqsiV4(order, paymentType = 'card') {
  const body = buildAqsiV4ReceiptPayload(order, paymentType);

  logger.info('aqsi', {
    action: 'send_order_v4',
    order_id: order.id,
    device_id: body.deviceId,
    payment_type: paymentType,
    total_kopeks: body.payments[0]?.amount,
  });

  try {
    const result = await aqsiRequest('post', '/v4/Receipts/process', { data: body });
    logger.info('aqsi', { action: 'send_order_v4_ok', order_id: order.id, result_id: result?.id ?? result?.guid });
    return result;
  } catch (error) {
    logger.error('aqsi', { action: 'send_order_v4_fail', order_id: order.id, message: error.message });
    throw error;
  }
}

async function getAqsiOrder(orderId) {
  return aqsiRequest('get', `/v2/Orders/simple/${encodeURIComponent(String(orderId))}`);
}

function isAqsiOrderNotFoundError(error) {
  const text = error instanceof Error ? error.message : String(error || '');
  return text.includes('Заказ не найден') || text.includes('Order not found');
}

function extractAqsiFiscalData(aqsiOrder) {
  const receipt = aqsiOrder?.receipts?.[0] ?? null;
  const docInfo = receipt?.info?.docInfo ?? null;

  if (!receipt) {
    return null;
  }

  return {
    fiscal_fd: receipt.documentNumber ?? docInfo?.docNumber ?? null,
    fiscal_fn: receipt.fsNumber ?? docInfo?.fiscalStorageNumber ?? null,
    fiscal_fp:
      receipt.fp ??
      docInfo?.docFiscalAttributeInt ??
      docInfo?.docFiscalAttribute ??
      null,
    fiscal_kkt_reg: receipt.deviceRN ?? docInfo?.deviceRegNumber ?? null,
    fiscal_date: receipt.processedAtTz ?? receipt.info?.dateTime ?? null,
  };
}

async function sendV4ReceiptRequest(payload) {
  return aqsiRequest('post', '/v4/Receipts/process', { data: payload });
}

async function startSlipPurchase(deviceId, amountKopeks) {
  const rawCount = Number(process.env.AQSI_SLIP_PRINT_COUNT);
  const printCount = [0, 1, 2].includes(rawCount) ? rawCount : 1;
  const rawTtl = Number(process.env.AQSI_SLIP_TTL_MS);
  const ttlMillis = Number.isFinite(rawTtl) && rawTtl >= 15000 && rawTtl <= 300000
    ? Math.round(rawTtl)
    : 60000;

  logger.info('aqsi', { action: 'slip_purchase_start', device_id: deviceId, amount_kopeks: amountKopeks, print_count: printCount, ttl_ms: ttlMillis });

  return aqsiRequest('post', '/v4/Slips/process/purchase', {
    data: {
      deviceId: Number(deviceId),
      amount: amountKopeks,
      ttlMillis,
      printCount,
    },
  });
}

async function getOperation(operationId) {
  return aqsiRequest('get', `/v4/Operations/${encodeURIComponent(operationId)}`);
}

async function cancelOperation(operationId) {
  return aqsiRequest('post', `/v4/Operations/${encodeURIComponent(operationId)}/cancel`);
}

// Poll operation until terminal status (non-pending), with timeout
async function pollOperation(operationId, intervalMs = 2000, timeoutMs = 60000) {
  const TERMINAL = new Set(['Completed', 'Canceled', 'Timeout', 'Error']);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const op = await getOperation(operationId);
    if (TERMINAL.has(op.status)) return op;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Превышено время ожидания операции');
}

function extractSlipResultData(operation) {
  if (!operation.result) return null;
  try {
    return typeof operation.result === 'string'
      ? JSON.parse(operation.result)
      : operation.result;
  } catch {
    return null;
  }
}

function isSlipPaid(slipData) {
  const rc = slipData?.content?.responseCode;
  // "000"/"00" — card approval; "SUCCESS" — SBP (QR) approval
  return rc === '000' || rc === '00' || rc === 'SUCCESS';
}

function extractReceiptFiscalData(operation) {
  const receiptData = extractSlipResultData(operation);
  if (!receiptData) return null;

  const docInfo = receiptData.info?.docInfo ?? null;
  if (!docInfo) return null;

  return {
    fiscal_fd: docInfo.docNumber != null ? String(docInfo.docNumber) : null,
    fiscal_fn: docInfo.fiscalStorageNumber ?? null,
    fiscal_fp: docInfo.docFiscalAttributeInt != null
      ? String(docInfo.docFiscalAttributeInt)
      : (docInfo.docFiscalAttribute ?? null),
    fiscal_kkt_reg: docInfo.deviceRegNumber ?? null,
    fiscal_date: receiptData.info?.dateTime ?? null,
    has_marking_errors: receiptData.info?.hasMarkingCodeErrors ?? null,
    receipt_id: receiptData.id ?? receiptData.guid ?? receiptData.receiptId ?? null,
  };
}

async function getAqsiHook() {
  return aqsiRequest('get', '/v4/Operations/Hooks');
}

async function listAqsiReceipts(params) {
  return aqsiRequest('get', '/v4/Receipts', { params });
}

async function listAqsiSlips(params) {
  return aqsiRequest('get', '/v4/Slips', { params });
}

async function getAqsiSlip(slipId) {
  return aqsiRequest('get', `/v4/Slips/${encodeURIComponent(slipId)}`);
}

module.exports = {
  buildAqsiOrderPayload,
  buildAqsiV4ReceiptPayload,
  extractAqsiFiscalData,
  extractReceiptFiscalData,
  isAqsiOrderNotFoundError,
  isSlipPaid,
  extractSlipResultData,
  sendOrderToAqsi,
  sendOrderToAqsiV4,
  sendRefundToAqsi,
  getAqsiShiftStatus,
  ensureAqsiShiftOpen,
  sendV4ReceiptRequest,
  startSlipPurchase,
  getOperation,
  cancelOperation,
  pollOperation,
  getAqsiOrder,
  getAqsiHook,
  listAqsiReceipts,
  listAqsiSlips,
  getAqsiSlip,
};
