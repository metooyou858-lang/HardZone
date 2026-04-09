import { apiFetch } from "./client";

export type TrainingType = {
  id: string;
  name: string;
  slot_type: "group" | "personal" | "rental";
  color: string | null;
  duration: number | null;
  capacity: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function fetchTrainingTypes(params?: {
  slot_type?: "group" | "personal";
  include_inactive?: boolean;
}): Promise<TrainingType[]> {
  const query = new URLSearchParams();

  if (params?.slot_type) {
    query.set("slot_type", params.slot_type);
  }

  if (params?.include_inactive) {
    query.set("include_inactive", "true");
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiFetch<ApiEnvelope<TrainingType[]>>(`/training-types${suffix}`);
  return response.data;
}

export async function createTrainingType(data: {
  name: string;
  slot_type: "group" | "personal";
  color?: string | null;
  duration?: number | null;
  capacity?: number | null;
  description?: string | null;
}): Promise<TrainingType> {
  const response = await apiFetch<ApiEnvelope<TrainingType>>("/training-types", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function updateTrainingType(
  id: string,
  data: Partial<{
    name: string;
    slot_type: "group" | "personal";
    color: string | null;
    duration: number | null;
    capacity: number | null;
    description: string | null;
    is_active: boolean;
  }>
): Promise<TrainingType> {
  const response = await apiFetch<ApiEnvelope<TrainingType>>(`/training-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function deleteTrainingType(id: string): Promise<void> {
  await apiFetch(`/training-types/${id}`, { method: "DELETE" });
}
