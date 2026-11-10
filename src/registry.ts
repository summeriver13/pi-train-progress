import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_REGISTRY_DIR = join(homedir(), ".pi", "agent", "train-progress");
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function registryDir(): string {
  return process.env.PI_TRAIN_REGISTRY_DIR?.trim() || DEFAULT_REGISTRY_DIR;
}

function registryFilePath(sessionId: string): string | undefined {
  if (!SESSION_ID_PATTERN.test(sessionId)) return undefined;
  return join(registryDir(), sessionId);
}

function firstLine(text: string): string {
  return text.split(/\r\n|\r|\n/, 1)[0]?.trim() ?? "";
}

export async function readRegistryLog(sessionId: string): Promise<string | undefined> {
  const path = registryFilePath(sessionId);
  if (path === undefined) return undefined;

  try {
    const logPath = firstLine(await readFile(path, "utf8"));
    return logPath.length > 0 ? logPath : undefined;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function writeRegistryLog(sessionId: string, logPath: string): Promise<void> {
  const path = registryFilePath(sessionId);
  if (path === undefined) throw new Error("Invalid session ID");

  const value = logPath.trim();
  if (value.length === 0) throw new Error("Empty log path");

  await mkdir(registryDir(), { recursive: true });
  await writeFile(path, value + "\n", "utf8");
}

export async function removeRegistryLog(sessionId: string): Promise<void> {
  const path = registryFilePath(sessionId);
  if (path === undefined) return;

  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}
