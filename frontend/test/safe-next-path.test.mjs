import assert from "node:assert/strict";
import test from "node:test";

import { getSafeNextPath } from "../lib/safe-next-path.ts";

test("accepts only local application paths", () => {
  assert.equal(getSafeNextPath("/clients/42?tab=visits"), "/clients/42?tab=visits");
  assert.equal(getSafeNextPath("/"), "/");
});

test("rejects executable, external, and malformed destinations", () => {
  assert.equal(getSafeNextPath("javascript:alert(1)"), "/");
  assert.equal(getSafeNextPath("https://example.com"), "/");
  assert.equal(getSafeNextPath("//example.com"), "/");
  assert.equal(getSafeNextPath("/\\example.com"), "/");
  assert.equal(getSafeNextPath("clients"), "/");
  assert.equal(getSafeNextPath(null), "/");
});
