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
