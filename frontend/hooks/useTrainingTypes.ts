"use client";

import { useCallback, useEffect, useState } from "react";

import {
  TrainingType,
  createTrainingType,
  deleteTrainingType,
  fetchTrainingTypes,
  updateTrainingType,
} from "@/lib/api/training-types";

function sortByName(items: TrainingType[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export function useTrainingTypes() {
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setTrainingTypes(sortByName(await fetchTrainingTypes({ include_inactive: true })));
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(data: Parameters<typeof createTrainingType>[0]) {
    const created = await createTrainingType(data);
    setTrainingTypes((previous) => sortByName([...previous, created]));
    return created;
  }

  async function update(id: string, data: Parameters<typeof updateTrainingType>[1]) {
    const updated = await updateTrainingType(id, data);
    setTrainingTypes((previous) =>
      sortByName(previous.map((current) => (current.id === id ? updated : current)))
    );
    return updated;
  }

  async function remove(id: string) {
    await deleteTrainingType(id);
    setTrainingTypes((previous) => previous.filter((current) => current.id !== id));
  }

  return {
    trainingTypes,
    loading,
    error,
    reload: load,
    create,
    update,
    remove,
  };
}
