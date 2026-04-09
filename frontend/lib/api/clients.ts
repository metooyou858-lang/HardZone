import { apiFetch } from "./client";

export type ClientStatus = "active" | "away" | "frozen" | "inactive";
export type SubscriptionType = "single" | "visits" | "period" | "unlimited";
export type SubscriptionStatus = "active" | "frozen" | "expired" | "exhausted";
export type VisitType = "group" | "open_gym";

export type Client = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  barcode: string | null;
  discount: string;
  status: ClientStatus;
  status_comment: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientSubscription = {
  id: string;
  client_id: string;
  type: SubscriptionType;
  visits_total: number | null;
  visits_left: number | null;
  started_at: string | null;
  expires_at: string | null;
  is_family: boolean;
  status: SubscriptionStatus;
  order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientVisit = {
  id: string;
  client_id: string;
  subscription_id: string | null;
  visit_type: VisitType;
  visited_at: string;
  schedule_id: string | null;
  created_by: string | null;
};

export type ClientListItem = Client & {
  subscription_id: string | null;
  subscription_type: SubscriptionType | null;
  subscription_status: SubscriptionStatus | null;
  visits_left: number | null;
  expires_at: string | null;
  is_family: boolean | null;
};

export type ClientDetail = Client & {
  subscriptions: ClientSubscription[];
  visits: ClientVisit[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function fetchClients(params?: {
  search?: string;
  status?: ClientStatus;
  limit?: number;
  offset?: number;
}): Promise<ClientListItem[]> {
  const query = new URLSearchParams();

  if (params?.search) {
    query.set("search", params.search);
  }
  if (params?.status) {
    query.set("status", params.status);
  }
  query.set("limit", String(params?.limit ?? 50));
  query.set("offset", String(params?.offset ?? 0));

  const response = await apiFetch<ApiEnvelope<ClientListItem[]>>(`/clients?${query.toString()}`);
  return response.data;
}

export async function fetchClient(id: string): Promise<ClientDetail> {
  const response = await apiFetch<ApiEnvelope<ClientDetail>>(`/clients/${id}`);
  return response.data;
}

export async function findClientByBarcode(barcode: string): Promise<ClientListItem> {
  const response = await apiFetch<ApiEnvelope<ClientListItem>>(
    `/clients/barcode/${encodeURIComponent(barcode)}`
  );
  return response.data;
}

export async function createClient(data: {
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  discount?: number;
  status?: ClientStatus;
  status_comment?: string | null;
  comment?: string | null;
}): Promise<Client> {
  const response = await apiFetch<ApiEnvelope<Client>>("/clients", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function updateClient(
  id: string,
  data: Partial<{
    first_name: string;
    last_name: string;
    middle_name: string | null;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    discount: number;
    status: ClientStatus;
    status_comment: string | null;
    comment: string | null;
  }>
): Promise<Client> {
  const response = await apiFetch<ApiEnvelope<Client>>(`/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function importClientsCsv(file: File): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch<ApiEnvelope<{ created: number; skipped: number; errors: string[] }>>(
    "/clients/import",
    {
      method: "POST",
      body: formData,
    }
  );
  return response.data;
}

export async function createSubscription(data: {
  client_id: string | number;
  type: SubscriptionType;
  visits_total?: number | null;
  started_at?: string | null;
  expires_at?: string | null;
  is_family?: boolean;
  order_id?: string | null;
}): Promise<ClientSubscription> {
  const response = await apiFetch<ApiEnvelope<ClientSubscription>>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function freezeSubscription(id: string | number, reason?: string): Promise<unknown> {
  const response = await apiFetch<ApiEnvelope<unknown>>(`/subscriptions/${id}/freeze`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? null }),
  });
  return response.data;
}

export async function unfreezeSubscription(id: string | number): Promise<{ days_restored: number }> {
  const response = await apiFetch<ApiEnvelope<{ days_restored: number }>>(`/subscriptions/${id}/unfreeze`, {
    method: "POST",
  });
  return response.data;
}
