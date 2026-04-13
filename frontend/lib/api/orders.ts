import { apiFetch } from "./client";

export type OrderStatus = "open" | "confirmed" | "cancelled" | "partially_refunded" | "refunded";
export type OrderItemKind = "product" | "service" | "subscription";
export type PaymentType = "cash" | "card";

export type Order = {
  id: string;
  status: OrderStatus;
  payment_type: PaymentType | null;
  client_id: string | null;
  total_amount: string;
  items_count: number;
  aqsi_receipt_id: string | null;
  aqsi_sent_at?: string | null;
  aqsi_sync_attempted_at?: string | null;
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

export async function fetchOrders(status?: OrderStatus, limit = 50): Promise<Order[]> {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
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

export async function confirmOrder(orderId: string, payment_type: PaymentType): Promise<Order> {
  const response = await apiFetch<ApiEnvelope<Order>>(`/orders/${orderId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ payment_type }),
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

export async function cancelOrder(orderId: string): Promise<Order> {
  const response = await apiFetch<ApiEnvelope<Order>>(`/orders/${orderId}/cancel`, {
    method: "POST",
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
