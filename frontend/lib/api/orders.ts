import { apiFetch } from "./client";

export type OrderStatus = "open" | "confirmed" | "cancelled" | "partially_refunded" | "refunded";
export type OrderItemKind = "product" | "service" | "subscription";
export type PaymentType = "cash" | "card";

export type Order = {
  id: string;
  status: OrderStatus;
  payment_type: PaymentType | null;
  client_id: string | null;
  client_name: string | null;
  total_amount: string;
  items_count: number;
  aqsi_receipt_id: string | null;
  aqsi_sent_at?: string | null;
  aqsi_sync_attempted_at?: string | null;
  aqsi_payment_operation_id?: string | null;
  aqsi_payment_status?: string | null;
  aqsi_slip_id?: string | null;
  aqsi_receipt_operation_id?: string | null;
  aqsi_receipt_status?: string | null;
  aqsi_error?: string | null;
  discount_percent: string | null;
  discount_money: string | null;
  comment: string | null;
  user_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  kind: OrderItemKind;
  product_id: string | null;
  name: string;
  sku: string | null;
  sale_price: string;
  cost_price: string | null;
  quantity: number;
  total: string;
  discount_percent: string | null;
  discount_money: string | null;
  marking_required: boolean;
  marking_code: string | null;
  refunded_quantity: number;
  last_refunded_at?: string | null;
  created_at: string;
};

export type OrderDetail = Order & {
  items: OrderItem[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function createOrder(comment?: string, client_id?: string | number | null): Promise<Order> {
  const response = await apiFetch<ApiEnvelope<Order>>("/orders", {
    method: "POST",
    body: JSON.stringify({ comment: comment ?? null, client_id: client_id ?? null }),
  });
  return response.data;
}

export async function fetchOrder(id: string): Promise<OrderDetail> {
  const response = await apiFetch<ApiEnvelope<OrderDetail>>(`/orders/${id}`);
  return response.data;
}

export async function fetchOrders(status?: OrderStatus, limit = 50, paid?: boolean): Promise<Order[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (paid) params.set("paid", "true");
  params.set("limit", String(limit));

  const response = await apiFetch<ApiEnvelope<Order[]>>(`/orders?${params.toString()}`);
  return response.data;
}

export async function updateOrder(
  orderId: string,
  data: {
    discount_percent?: number;
    discount_money?: number;
    client_id?: string | number | null;
  }
): Promise<Order> {
  const response = await apiFetch<ApiEnvelope<Order>>(`/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function addOrderItem(
  orderId: string,
  data: {
    kind?: OrderItemKind;
    product_id?: string | number | null;
    name?: string;
    sku?: string | null;
    sale_price?: number | null;
    cost_price?: number | null;
    quantity: number;
    discount_percent?: number;
    discount_money?: number;
    marking_code?: string | null;
  }
): Promise<{ order: Order; item: OrderItem }> {
  const response = await apiFetch<ApiEnvelope<{ order: Order; item: OrderItem }>>(
    `/orders/${orderId}/items`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
  return response.data;
}

export async function updateOrderItem(
  orderId: string,
  itemId: string,
  data: {
    quantity?: number;
    discount_percent?: number;
    discount_money?: number;
    marking_code?: string | null;
  }
): Promise<{ order: Order; item: OrderItem }> {
  const response = await apiFetch<ApiEnvelope<{ order: Order; item: OrderItem }>>(
    `/orders/${orderId}/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
  return response.data;
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<Order> {
  const response = await apiFetch<ApiEnvelope<Order>>(`/orders/${orderId}/items/${itemId}`, {
    method: "DELETE",
  });
  return response.data;
}

export async function sendOrderToAqsi(
  orderId: string,
  client_id?: string | number | null
): Promise<unknown> {
  const response = await apiFetch<ApiEnvelope<unknown>>(`/orders/${orderId}/send-to-aqsi`, {
    method: "POST",
    body: JSON.stringify({ client_id: client_id ?? null }),
  });
  return response.data;
}

export type InitiatePaymentResult =
  | { status: "started"; operation_id: string }
  | { status: "operation_in_progress"; conflicting_operation_id: string | null };

export async function initiatePayment(orderId: string): Promise<InitiatePaymentResult> {
  const response = await apiFetch<ApiEnvelope<{ operation_id?: string; status?: string; conflicting_operation_id?: string | null }>>(
    `/orders/${orderId}/initiate-payment`,
    { method: "POST" }
  );
  const d = response.data;
  if (d.status === "operation_in_progress") {
    return { status: "operation_in_progress", conflicting_operation_id: d.conflicting_operation_id ?? null };
  }
  return { status: "started", operation_id: d.operation_id! };
}

export type SlipSyncStatus =
  | "pending"
  | "confirmed"
  | "already_closed"
  | "cancelled"
  | "failed"
  | "declined"
  | "confirmed_no_fiscal"
  | "receipt_error"
  | "no_payment_operation";

export async function syncSlip(orderId: string): Promise<{
  status: SlipSyncStatus;
  operation_status?: string;
  message?: string;
  has_marking_errors?: boolean | null;
}> {
  const response = await apiFetch<ApiEnvelope<{
    status: SlipSyncStatus;
    operation_status?: string;
    message?: string;
    has_marking_errors?: boolean | null;
  }>>(`/orders/${orderId}/sync-slip`, { method: "POST" });
  return response.data;
}

export async function syncAqsiV4(orderId: string): Promise<{
  status: string;
  operation_status?: string;
  message?: string;
  has_marking_errors?: boolean | null;
}> {
  const response = await apiFetch<ApiEnvelope<{
    status: string;
    operation_status?: string;
    message?: string;
    has_marking_errors?: boolean | null;
  }>>(`/orders/${orderId}/sync-aqsi-v4`, { method: "POST" });
  return response.data;
}

export async function syncOrderWithAqsi(orderId: string): Promise<{
  paid: boolean;
  payment_type: PaymentType | null;
  aqsi_status: string | null;
  order: Order;
}> {
  const response = await apiFetch<
    ApiEnvelope<{
      paid: boolean;
      payment_type: PaymentType | null;
      aqsi_status: string | null;
      order: Order;
    }>
  >(`/orders/${orderId}/sync-aqsi`, {
    method: "POST",
  });
  return response.data;
}

export async function recoverTerminalBlocker(operationId: string): Promise<{
  resolved: boolean;
  status: string | null;
  paid?: boolean;
  slip_id?: string | null;
  message?: string;
}> {
  const response = await apiFetch<ApiEnvelope<{
    resolved: boolean;
    status: string | null;
    paid?: boolean;
    slip_id?: string | null;
    message?: string;
  }>>("/orders/recover-terminal-blocker", {
    method: "POST",
    body: JSON.stringify({ operation_id: operationId }),
  });
  return response.data;
}

export async function forceClearBlocker(operationId: string): Promise<{
  resolved: boolean;
  was_status: string | null;
  message?: string;
}> {
  const response = await apiFetch<ApiEnvelope<{
    resolved: boolean;
    was_status: string | null;
    message?: string;
  }>>("/orders/force-clear-blocker", {
    method: "POST",
    body: JSON.stringify({ operation_id: operationId }),
  });
  return response.data;
}

export async function refundOrder(
  orderId: string,
  items?: Array<{ item_id: string; quantity: number }>
): Promise<{ order: Order; refund_amount?: string; items?: Array<{ item_id: string; name: string; quantity: number }> }> {
  const response = await apiFetch<
    ApiEnvelope<{
      order: Order;
      refund_amount?: string;
      items?: Array<{ item_id: string; name: string; quantity: number }>;
    }>
  >(`/orders/${orderId}/refund`, {
    method: "POST",
    body: JSON.stringify(items?.length ? { items } : {}),
  });
  return response.data;
}
