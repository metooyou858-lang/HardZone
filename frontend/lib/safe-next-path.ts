const APP_ORIGIN = "https://hardzone.local";

export function getSafeNextPath(value: string | null | undefined) {
  if (!value?.startsWith("/")) return "/";

  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
