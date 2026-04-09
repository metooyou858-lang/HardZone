const API = "/backend-api";

export const defaultHeaders = {
  "Content-Type": "application/json",
};

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  const hasFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;

  if (!hasFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(nextPath)}`;
    }

    throw new Error(data?.error ?? data?.hint ?? "Неизвестная ошибка");
  }

  return data as T;
}
