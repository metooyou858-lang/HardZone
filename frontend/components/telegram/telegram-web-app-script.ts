"use client";

const TELEGRAM_WEB_APP_SCRIPT_ID = "telegram-web-app-sdk";
const TELEGRAM_WEB_APP_SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

let telegramScriptPromise: Promise<boolean> | null = null;

export function ensureTelegramWebAppScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Telegram?.WebApp) return Promise.resolve(true);

  if (telegramScriptPromise) return telegramScriptPromise;

  telegramScriptPromise = new Promise<boolean>((resolve) => {
    const existingScript = document.getElementById(TELEGRAM_WEB_APP_SCRIPT_ID) as HTMLScriptElement | null;
    const timeoutId = window.setTimeout(() => resolve(false), 4000);

    const finish = (loaded: boolean) => {
      window.clearTimeout(timeoutId);
      resolve(loaded);
    };
    const resolveLoaded = () => finish(Boolean(window.Telegram?.WebApp));
    const resolveFailed = () => finish(false);

    if (existingScript) {
      existingScript.addEventListener("load", resolveLoaded, { once: true });
      existingScript.addEventListener("error", resolveFailed, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = TELEGRAM_WEB_APP_SCRIPT_ID;
    script.src = TELEGRAM_WEB_APP_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", resolveLoaded, { once: true });
    script.addEventListener("error", resolveFailed, { once: true });
    document.head.appendChild(script);
  });

  return telegramScriptPromise;
}

function readTelegramInitData() {
  const sdkInitData = window.Telegram?.WebApp?.initData || "";
  if (sdkInitData) return sdkInitData;

  for (const source of [window.location.hash.slice(1), window.location.search.slice(1)]) {
    const initData = new URLSearchParams(source).get("tgWebAppData") || "";
    if (initData) return initData;
  }

  return "";
}

export async function waitForTelegramInitData(timeoutMs = 2500) {
  if (typeof window === "undefined") return "";

  await ensureTelegramWebAppScript();
  window.Telegram?.WebApp?.ready?.();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const initData = readTelegramInitData();
    if (initData) return initData;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  return "";
}
