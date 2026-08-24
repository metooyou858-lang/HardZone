const TELEGRAM_METHOD_PATH = /^\/bot\d{5,20}:[A-Za-z0-9_-]{20,}\/[A-Za-z][A-Za-z0-9_]{0,63}$/;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ status: "ok" }, 200);
  }

  if (request.method !== "POST" || !TELEGRAM_METHOD_PATH.test(url.pathname)) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const expectedSecret = String(env.RELAY_SECRET || "");
  const providedSecret = String(request.headers.get("x-hardzone-telegram-relay") || "");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: "not_found" }, 404);
  }

  const upstreamHeaders = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    upstreamHeaders.set("content-type", contentType);
  }

  const upstreamBody = await request.arrayBuffer();

  const upstream = await fetchImpl(`https://api.telegram.org${url.pathname}`, {
    method: "POST",
    headers: upstreamHeaders,
    body: upstreamBody,
    redirect: "manual",
  });

  const responseHeaders = new Headers({ "cache-control": "no-store" });
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) {
    responseHeaders.set("content-type", upstreamContentType);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
