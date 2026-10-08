import { apiFetch } from "./client";

export type CompetitionCategory = string;
export type CompetitionRegistrationStatus = "registered" | "cancelled";
export type CompetitionPaymentStatus = "pending" | "processing" | "paid" | "failed" | "refunded";

export type CompetitionPublicConfig = {
  legacy: boolean;
  public_path: string;
  categories: { key: string; name: string; registration_limit: number | null }[];
  terms_text: string;
  event_key: string;
  name: string;
  date: string | null;
  location: string;
  fee_rubles: number | null;
  terms_version: string;
  privacy_version: string;
  registration_enabled: boolean;
  online_registration_closed_at: string | null;
  onsite_registration_closed_at: string | null;
  payment_enabled: boolean;
  registration_availability?: Record<string, { occupied: number; limit: number | null; available: number | null; full: boolean }>;
  chat_urls: Record<CompetitionCategory, string | null>;
  messenger_urls: { whatsapp: string; telegram: string };
  organizer: {
    name: string;
    inn: string;
    ogrnip: string;
    registration_address: string;
    phone: string;
    email: string;
  };
};

export type CompetitionRegistration = {
  id: string;
  team_name: string;
  category: CompetitionCategory;
  team_email: string | null;
  payment_deadline: string | null;
  expired_at: string | null;
  automation_error: string | null;
  email_delivery_issue: boolean;
  male_name: string;
  male_phone: string;
  female_name: string;
  female_phone: string;
  terms_version: string;
  terms_accepted_at: string;
  privacy_version: string | null;
  privacy_accepted_at: string | null;
  payment_status: CompetitionPaymentStatus;
  paid_at: string | null;
  onsite_status: "pending" | "arrived" | "no_show";
  onsite_updated_at: string | null;
  status: CompetitionRegistrationStatus;
  created_at: string;
  updated_at: string;
};

type CompetitionPayload = {
  competition: CompetitionPublicConfig;
  registrations: CompetitionRegistration[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function fetchCompetitionRegistrations(eventKey?: string): Promise<CompetitionPayload> {
  const response = await apiFetch<ApiEnvelope<CompetitionPayload>>(`/competitions${eventKey ? `?event=${encodeURIComponent(eventKey)}` : ""}`);
  return response.data;
}

export async function updateCompetitionRegistrationStatus(
  id: string,
  status: CompetitionRegistrationStatus,
  eventKey?: string
): Promise<CompetitionRegistration[]> {
  const response = await apiFetch<ApiEnvelope<CompetitionRegistration[]>>(
    `/competitions/${id}/status${eventKey ? `?event=${encodeURIComponent(eventKey)}` : ""}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
  return response.data;
}

export type CompetitionEvent = CompetitionPublicConfig & { registrations_count: number; confirmed_count: number };
export type CompetitionEventInput = Pick<CompetitionPublicConfig, "name" | "date" | "location" | "fee_rubles" | "categories" | "terms_text" | "registration_enabled">;

export async function fetchCompetitionEvents(): Promise<CompetitionEvent[]> {
  return (await apiFetch<ApiEnvelope<CompetitionEvent[]>>("/competitions/events")).data;
}

export async function saveCompetitionEvent(input: CompetitionEventInput, eventKey?: string): Promise<CompetitionPublicConfig> {
  return (await apiFetch<ApiEnvelope<CompetitionPublicConfig>>(`/competitions/events${eventKey ? `/${encodeURIComponent(eventKey)}` : ""}`, {
    method: eventKey ? "PATCH" : "POST", body: JSON.stringify(input),
  })).data;
}

export async function closeCompetitionOnlineRegistration(eventKey: string): Promise<CompetitionPublicConfig> {
  return (await apiFetch<ApiEnvelope<CompetitionPublicConfig>>(`/competitions/events/${encodeURIComponent(eventKey)}/online-registration/close`, { method: "POST" })).data;
}

type CompetitionOperationsPayload = { competition: CompetitionPublicConfig; registrations: CompetitionRegistration[] };

export async function updateCompetitionOnsiteStatus(eventKey: string, registrationId: string, status: "pending" | "arrived"): Promise<CompetitionRegistration[]> {
  return (await apiFetch<ApiEnvelope<CompetitionRegistration[]>>(`/competitions/events/${encodeURIComponent(eventKey)}/onsite-registration/${encodeURIComponent(registrationId)}`, {
    method: "PATCH", body: JSON.stringify({ status }),
  })).data;
}

export async function finishCompetitionOnsiteRegistration(eventKey: string): Promise<CompetitionOperationsPayload> {
  return (await apiFetch<ApiEnvelope<CompetitionOperationsPayload>>(`/competitions/events/${encodeURIComponent(eventKey)}/onsite-registration/finish`, { method: "POST" })).data;
}

export async function reopenCompetitionOnsiteRegistration(eventKey: string): Promise<CompetitionOperationsPayload> {
  return (await apiFetch<ApiEnvelope<CompetitionOperationsPayload>>(`/competitions/events/${encodeURIComponent(eventKey)}/onsite-registration/reopen`, { method: "POST" })).data;
}
