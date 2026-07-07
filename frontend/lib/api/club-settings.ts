import { apiFetch } from "./client";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type ClubContacts = {
  title: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  yandex_maps_url: string | null;
  google_maps_url: string | null;
  two_gis_url: string | null;
  vk_url: string | null;
  instagram_url: string | null;
  telegram_url: string | null;
  whatsapp_url: string | null;
  max_url: string | null;
  schedule_note: string | null;
  extra_note: string | null;
  updated_at: string;
};

export type ClubContactsInput = Partial<Omit<ClubContacts, "updated_at">>;

export async function fetchClubContacts(): Promise<ClubContacts> {
  const response = await apiFetch<ApiEnvelope<ClubContacts>>("/club-settings/contacts");
  return response.data;
}

export async function updateClubContacts(data: ClubContactsInput): Promise<ClubContacts> {
  const response = await apiFetch<ApiEnvelope<ClubContacts>>("/club-settings/contacts", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return response.data;
}
