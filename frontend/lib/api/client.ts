const API = "/backend-api";

export const defaultHeaders = {
  "Content-Type": "application/json",
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers ?? {});
  const hasFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;

  if (!hasFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "AbortError"
        ? "Запрос к серверу отменён"
        : "Не удалось связаться с сервером. Проверьте интернет и доступность HardZone."
    );
  }

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?next=${encodeURIComponent(nextPath)}`;
    }

    const errorData = data as { error?: string; hint?: string } | null;
    throw new ApiError(errorData?.error ?? errorData?.hint ?? "Неизвестная ошибка сервера", response.status, data);
  }

  return data as T;
}
