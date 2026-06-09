import { apiFetch } from "./client";
import { TrainingType } from "./training-types";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type Trainer = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  bio: string | null;
  photo_url: string | null;
  position: string | null;
  rating: number;
  reviews_count: number;
  specialties: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  linked_user: TrainerStaffUser | null;
  training_types: TrainingType[];
};

export type TrainerStaffUser = {
  id: string;
  name: string;
  email: string | null;
  role_title: string | null;
  is_active: boolean;
  trainer_id: string | null;
};

export async function fetchTrainers(): Promise<Trainer[]> {
  const response = await apiFetch<ApiEnvelope<Trainer[]>>("/trainers");
  return response.data;
}

export async function fetchTrainerStaffUsers(): Promise<TrainerStaffUser[]> {
  const response = await apiFetch<ApiEnvelope<TrainerStaffUser[]>>("/trainers/staff-users");
  return response.data;
}

export async function createTrainer(data: {
  user_id?: number | null;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  position?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  specialties?: string[];
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
    photo_url: string | null;
    position: string | null;
    rating: number | null;
    reviews_count: number | null;
    specialties: string[];
    user_id: number | null;
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
