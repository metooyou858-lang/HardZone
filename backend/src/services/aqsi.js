const axios = require('axios');

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

function buildAqsiOrderPayload(order) {
  return {
    id: String(order.id),
    number: String(order.id).slice(0, 8),
    dateTime: new Date().toISOString(),
    shop: String(process.env.AQSI_SHOP_ID),
    content: {
      type: 3,
      discountMoney: asAmount(order.discount_money),
      discountPercent: asAmount(order.discount_percent),
      positions: order.items.map((item, index) => ({
        positionId: String(index + 1),
        text: item.name,
        quantity: item.quantity,
        price: asAmount(item.sale_price),
        tax: 6,
        paymentMethodType: 4,
        paymentSubjectType: item.kind === 'product' ? 1 : 4,
        unitOfMeasurement: 'Piece',
        unitCode: 0,
        addingType: 0,
        editable: false,
        discountMoney: resolveItemDiscountMoney(item),
      })),
      checkClose: {
        taxationSystem: 1,
      },
    },
    isEditableByDevice: true,
  };
}

async function aqsiRequest(method, path, options = {}) {
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
}

async function sendOrderToAqsi(order) {
  const body = buildAqsiOrderPayload(order);

  try {
    return await aqsiRequest('post', '/v2/Orders/simple', { data: body });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const payload =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      throw new Error(payload);
    }

    throw error;
  }
}

function mapPaymentTypeToAqsi(paymentType) {
  return paymentType === 'cash' ? 0 : 1;
}

async function sendRefundToAqsi(order, items) {
  const body = {
    fiscalDocumentNumber: Number(order.fiscal_fd),
    fiscalStorageNumber: order.fiscal_fn,
    fiscalDocumentAttribute: Number(order.fiscal_fp),
    kktRegId: order.fiscal_kkt_reg,
    dateTime: order.fiscal_date,
    positions: items.map((item, index) => ({
      positionId: String(index + 1),
      text: item.name,
      quantity: item.quantity,
      price: asAmount(item.sale_price),
      tax: 6,
      paymentMethodType: 4,
      paymentSubjectType: item.kind === 'product' ? 1 : 4,
      unitOfMeasurement: 'Piece',
      unitCode: 0,
      discountMoney: resolveItemDiscountMoney(item),
    })),
    checkClose: {
      payments: [
        {
          type: mapPaymentTypeToAqsi(order.payment_type),
          amount: asAmount(order.total_amount),
        },
      ],
      taxationSystem: 1,
    },
  };

  try {
    return await aqsiRequest('post', '/v2/Receipts/returnReceipt', { data: body });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const payload =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      throw new Error(payload);
    }

    throw error;
  }
}

async function getAqsiOrder(orderId) {
  try {
    return await aqsiRequest('get', `/v2/Orders/simple/${encodeURIComponent(String(orderId))}`);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const payload =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      throw new Error(payload);
    }

    throw error;
  }
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

async function getAqsiHook() {
  try {
    return await aqsiRequest('get', '/v4/Operations/Hooks');
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const payload =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      throw new Error(payload);
    }

    throw error;
  }
}

async function listAqsiReceipts(params) {
  try {
    return await aqsiRequest('get', '/v4/Receipts', { params });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const payload =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      throw new Error(payload);
    }

    throw error;
  }
}

module.exports = {
  buildAqsiOrderPayload,
  extractAqsiFiscalData,
  isAqsiOrderNotFoundError,
  sendOrderToAqsi,
  sendRefundToAqsi,
  getAqsiOrder,
  getAqsiHook,
  listAqsiReceipts,
};
