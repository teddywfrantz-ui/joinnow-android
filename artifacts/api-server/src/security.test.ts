import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOrigin } from "./security.ts";

test("allows local development origins and rejects unknown origins", () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("https://attacker.example"), false);
});