import assert from "node:assert/strict";
import test from "node:test";
import { formatOwner, parseOwner } from "./owner.ts";

test("parseOwner reads the session and working directory", () => {
  const owner = parseOwner(
    [
      "session=01a1a792-f89a-741c-80c5-ca91acd3dc86",
      "cwd=F:\\Project-Research",
      "started=2026-11-10T09:56:21+08:00",
    ].join("\n"),
  );

  assert.deepEqual(owner, {
    session: "01a1a792-f89a-741c-80c5-ca91acd3dc86",
    cwd: "F:\\Project-Research",
  });
});

test("parseOwner accepts CRLF and values with equals signs", () => {
  const owner = parseOwner("session=abc\r\ncwd=F:/a=b\r\n");

  assert.equal(owner?.session, "abc");
  assert.equal(owner?.cwd, "F:/a=b");
});

test("parseOwner ignores empty and unrelated sidecars", () => {
  assert.equal(parseOwner(""), undefined);
  assert.equal(parseOwner("started=2026-11-10T09:56:21+08:00\n"), undefined);
  assert.equal(parseOwner("session=\ncwd=\n"), undefined);
});

test("formatOwner shows the session and working directory", () => {
  assert.equal(
    formatOwner({ session: "abc", cwd: "F:\\Project-Research" }),
    "owner abc  F:\\Project-Research",
  );
});

test("formatOwner handles a terminal launch", () => {
  assert.equal(formatOwner({ session: "unknown", cwd: "/f/tmp" }), "owner unknown  /f/tmp");
  assert.equal(formatOwner({ cwd: "/f/tmp" }), "owner unknown  /f/tmp");
  assert.equal(formatOwner({ session: "abc" }), "owner abc");
  assert.equal(formatOwner({}), undefined);
});

test("formatOwner truncates a long working directory", () => {
  const line = formatOwner({ session: "abc", cwd: "x".repeat(80) });

  assert.ok(line);
  assert.match(line, /^owner abc  x+\.\.\.$/);
});
