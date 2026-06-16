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
  photo_url: string | null;
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
  product_id: string | null;
  product_name: string | null;
  allow_free_visit: boolean;
  allow_group_training: boolean;
  allow_personal_training: boolean;
  training_type_ids: number[];
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

export type LegacySubscriptionImportRow = {
  row_number: number;
  client_id: number | null;
  phone: string;
  email: string;
  first_name: string;
  last_name: string;
  product_id: number | null;
  product_name: string;
  type: SubscriptionType | null;
  visits_total: number | null;
  visits_left: number | null;
  started_at: string | null;
  expires_at: string | null;
  is_family: boolean;
  status: SubscriptionStatus | null;
  note: string;
  client: Pick<Client, "id" | "first_name" | "last_name" | "phone" | "email"> | null;
  product: { id: string; name: string } | null;
  errors: string[];
  warnings: string[];
  ready: boolean;
};

export type LegacySubscriptionImportPlan = {
  total: number;
  ready: number;
  conflicts: number;
  rows: LegacySubscriptionImportRow[];
};

export type LegacySubscriptionImportResult = LegacySubscriptionImportPlan & {
  batch_id: string;
  imported: number;
  skipped: number;
};

export type LegacySubscriptionService = {
  id: string;
  name: string;
  subscription_type: SubscriptionType;
  visits_total: number | null;
  validity_days: number | null;
  activation_type: "purchase" | "first_visit";
  is_family: boolean;
  allow_free_visit: boolean;
  allow_group_training: boolean;
  allow_personal_training: boolean;
  training_types: Array<{ id: string; name: string; color: string | null }>;
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

export async function uploadClientPhoto(id: string, file: File): Promise<Client> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await apiFetch<ApiEnvelope<Client>>(`/clients/${id}/photo`, {
    method: "POST",
    body: formData,
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

export async function previewLegacySubscriptionsCsv(file: File): Promise<LegacySubscriptionImportPlan> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch<ApiEnvelope<LegacySubscriptionImportPlan>>("/subscriptions/legacy-import/preview", {
    method: "POST",
    body: formData,
  });
  return response.data;
}

export async function importLegacySubscriptionsCsv(file: File): Promise<LegacySubscriptionImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch<ApiEnvelope<LegacySubscriptionImportResult>>("/subscriptions/legacy-import/confirm", {
    method: "POST",
    body: formData,
  });
  return response.data;
}

export async function fetchLegacySubscriptionServices(): Promise<LegacySubscriptionService[]> {
  const response = await apiFetch<ApiEnvelope<LegacySubscriptionService[]>>("/subscriptions/legacy-services");
  return response.data;
}

export async function createManualLegacySubscription(data: {
  client_id: string | number;
  product_id: string | number;
  visits_left?: number | null;
  started_at?: string | null;
  note?: string | null;
}): Promise<ClientSubscription> {
  const response = await apiFetch<ApiEnvelope<ClientSubscription>>("/subscriptions/legacy-manual", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
