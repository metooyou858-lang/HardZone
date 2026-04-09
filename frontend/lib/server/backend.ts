function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getBackendApiBase(): string {
  return normalizeBaseUrl(
    process.env.BACKEND_API_URL || process.env.INTERNAL_API_URL || "http://127.0.0.1:3000/api"
  );
}
