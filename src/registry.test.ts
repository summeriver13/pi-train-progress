import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { readRegistryLog, removeRegistryLog, writeRegistryLog } from "./registry.ts";

const SESSION_ID = "01a1a792-f89a-741c-80c5-ca91acd3dc86";
let registryDir = "";

beforeEach(async () => {
  registryDir = await mkdtemp(join(tmpdir(), "pi-train-registry-"));
  process.env.PI_TRAIN_REGISTRY_DIR = registryDir;
});

afterEach(async () => {
  delete process.env.PI_TRAIN_REGISTRY_DIR;
  await rm(registryDir, { recursive: true, force: true });
});

test("readRegistryLog reads the first line", async () => {
  await writeFile(
    join(registryDir, SESSION_ID),
    "F:/tmp/b0.log\r\nstarted=2026-11-10T09:56:21+08:00\r\n",
    "utf8",
  );

  assert.equal(await readRegistryLog(SESSION_ID), "F:/tmp/b0.log");
});

test("writeRegistryLog creates the directory and entry", async () => {
  const nested = join(registryDir, "nested");
  process.env.PI_TRAIN_REGISTRY_DIR = nested;

  await writeRegistryLog(SESSION_ID, "  F:/tmp/b0.log  ");

  assert.equal(await readRegistryLog(SESSION_ID), "F:/tmp/b0.log");
});

test("removeRegistryLog deletes the entry", async () => {
  await writeRegistryLog(SESSION_ID, "F:/tmp/b0.log");
  await removeRegistryLog(SESSION_ID);

  assert.equal(await readRegistryLog(SESSION_ID), undefined);
});

test("removeRegistryLog ignores a missing entry", async () => {
  await removeRegistryLog(SESSION_ID);
});

test("readRegistryLog ignores empty and invalid entries", async () => {
  await writeFile(join(registryDir, SESSION_ID), "\n", "utf8");

  assert.equal(await readRegistryLog(SESSION_ID), undefined);
  assert.equal(await readRegistryLog("../escape"), undefined);
});
