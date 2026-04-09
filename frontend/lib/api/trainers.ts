import { apiFetch } from "./client";
import { TrainingType } from "./training-types";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type Trainer = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  bio: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  training_types: TrainingType[];
};

export async function fetchTrainers(): Promise<Trainer[]> {
  const response = await apiFetch<ApiEnvelope<Trainer[]>>("/trainers");
  return response.data;
}

export async function createTrainer(data: {
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  training_type_ids?: number[];
}): Promise<Trainer> {
  const response = await apiFetch<ApiEnvelope<Trainer>>("/trainers", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function updateTrainer(
  id: string,
  data: Partial<{
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    bio: string | null;
    is_active: boolean;
    training_type_ids: number[];
  }>
): Promise<Trainer> {
  const response = await apiFetch<ApiEnvelope<Trainer>>(`/trainers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function deleteTrainer(id: string): Promise<void> {
  await apiFetch(`/trainers/${id}`, { method: "DELETE" });
}
