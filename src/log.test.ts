import assert from "node:assert/strict";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cleanPath, newestLogPath } from "./log.ts";

test("cleanPath strips matching quotes", () => {
  assert.equal(cleanPath('"F:/tmp/b0.log"'), "F:/tmp/b0.log");
  assert.equal(cleanPath("'F:/tmp/b0.log'"), "F:/tmp/b0.log");
});

test("newestLogPath picks the most recently written .log", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-train-"));
  try {
    const older = join(directory, "older.log");
    const newer = join(directory, "newer.log");
    await writeFile(older, "epoch 1/2\n", "utf8");
    await writeFile(newer, "epoch 1/2\n", "utf8");
    await writeFile(join(directory, "notes.txt"), "ignore me", "utf8");
    await utimes(older, 1_700_000_000, 1_700_000_000);
    await utimes(newer, 1_700_000_100, 1_700_000_100);

    assert.equal(await newestLogPath(directory), newer);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("newestLogPath returns undefined without a log", async () => {
  assert.equal(await newestLogPath(join(tmpdir(), "pi-train-missing-dir")), undefined);
  const directory = await mkdtemp(join(tmpdir(), "pi-train-"));
  try {
    await writeFile(join(directory, "notes.txt"), "ignore me", "utf8");
    assert.equal(await newestLogPath(directory), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cleanPath maps a Git Bash drive path on Windows", () => {
  if (process.platform !== "win32") return;

  assert.equal(cleanPath("/f/tmp/b0.log"), "F:/tmp/b0.log");
  assert.equal(cleanPath("/foo/bar"), "/foo/bar");
});
