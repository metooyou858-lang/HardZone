import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./worker.mjs";

const ENV = { RELAY_SECRET: "test-relay-secret" };

test("health endpoint is public and does not contact Telegram", async () => {
  let contactedTelegram = false;
  const response = await handleRequest(
    new Request("https://relay.example/health"),
    ENV,
    async () => {
      contactedTelegram = true;
      return new Response();
    }
  );

  assert.equal(response.status, 200);
  assert.equal(contactedTelegram, false);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("relay hides Telegram routes without the shared secret", async () => {
  const response = await handleRequest(
    new Request("https://relay.example/bot123456:abcdefghijklmnopqrstuvwxyz1234/getMe", {
      method: "POST",
    }),
    ENV,
    async () => {
      throw new Error("Telegram must not be contacted");
    }
  );

  assert.equal(response.status, 404);
});

test("relay rejects paths outside Telegram Bot API", async () => {
  const response = await handleRequest(
    new Request("https://relay.example/https://example.com", {
      method: "POST",
      headers: { "x-hardzone-telegram-relay": ENV.RELAY_SECRET },
    }),
    ENV,
    async () => {
      throw new Error("Arbitrary upstream must not be contacted");
    }
  );

  assert.equal(response.status, 404);
});

test("relay forwards an authorized Telegram request and preserves its response", async () => {
  let forwardedUrl = "";
  let forwardedBody = "";
  let forwardedAsBuffer = false;
  const response = await handleRequest(
    new Request("https://relay.example/bot123456:abcdefghijklmnopqrstuvwxyz1234/sendMessage", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hardzone-telegram-relay": ENV.RELAY_SECRET,
      },
      body: JSON.stringify({ chat_id: 42, text: "test" }),
    }),
    ENV,
    async (url, options) => {
      forwardedUrl = url;
      forwardedAsBuffer = options.body instanceof ArrayBuffer;
      forwardedBody = await new Response(options.body).text();
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  );

  assert.equal(forwardedUrl, "https://api.telegram.org/bot123456:abcdefghijklmnopqrstuvwxyz1234/sendMessage");
  assert.equal(forwardedAsBuffer, true);
  assert.deepEqual(JSON.parse(forwardedBody), { chat_id: 42, text: "test" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, result: { message_id: 1 } });
});
