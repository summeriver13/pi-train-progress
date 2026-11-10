import assert from "node:assert/strict";
import test from "node:test";
import { cleanPath } from "./log.ts";

test("cleanPath strips matching quotes", () => {
  assert.equal(cleanPath('"F:/tmp/b0.log"'), "F:/tmp/b0.log");
  assert.equal(cleanPath("'F:/tmp/b0.log'"), "F:/tmp/b0.log");
});

test("cleanPath maps a Git Bash drive path on Windows", () => {
  if (process.platform !== "win32") return;

  assert.equal(cleanPath("/f/tmp/b0.log"), "F:/tmp/b0.log");
  assert.equal(cleanPath("/foo/bar"), "/foo/bar");
});
