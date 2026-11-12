import { open, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { formatOwner, parseOwner } from "./owner.ts";
import type { TrainingOwner } from "./owner.ts";
import { truncate } from "./progress.ts";

export const MAX_LAST_LINE = 110;

export function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeDrivePath(value: string): string {
  if (process.platform !== "win32") return value;
  if (!/^\/[a-zA-Z](\/|$)/.test(value)) return value;

  const drive = value.charAt(1).toUpperCase();
  return drive + ":" + (value.length === 2 ? "/" : value.slice(2));
}

export function cleanPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return normalizeDrivePath(trimmed);

  const first = trimmed.charAt(0);
  const last = trimmed.charAt(trimmed.length - 1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return normalizeDrivePath(trimmed.slice(1, -1));
  }
  return normalizeDrivePath(trimmed);
}

export async function newestLogPath(directory: string): Promise<string | undefined> {
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".log"));
  } catch {
    return undefined;
  }

  let newest: string | undefined;
  let newestTime = -1;
  for (const name of names) {
    const path = join(directory, name);
    try {
      const info = await stat(path);
      if (!info.isFile() || info.mtimeMs <= newestTime) continue;
      newest = path;
      newestTime = info.mtimeMs;
    } catch {
      continue;
    }
  }
  return newest;
}

export async function readTail(path: string, maxBytes: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const fileStat = await handle.stat();
    if (fileStat.size === 0) return "";

    const start = Math.max(0, fileStat.size - maxBytes);
    const length = fileStat.size - start;
    const buffer = new Uint8Array(length);
    const result = await handle.read(buffer, 0, length, start);
    const text = new TextDecoder().decode(buffer.subarray(0, result.bytesRead));
    if (start === 0) return text;

    const lineBreak = /\r\n|\r|\n/.exec(text);
    return lineBreak === null ? "" : text.slice(lineBreak.index + lineBreak[0].length);
  } finally {
    await handle.close();
  }
}

export interface OwnerRead {
  owner?: TrainingOwner;
  error?: string;
}

export async function readOwner(path: string): Promise<OwnerRead> {
  try {
    return { owner: parseOwner(await readFile(path, "utf8")) };
  } catch (error) {
    if (isNotFound(error)) return {};
    return { error: errorMessage(error) };
  }
}

export function formatOwnerLines(read: OwnerRead): string[] {
  const lines: string[] = [];
  const line = read.owner === undefined ? undefined : formatOwner(read.owner);
  if (line !== undefined) lines.push(line);
  if (read.error !== undefined) {
    lines.push("owner error: " + truncate(read.error, MAX_LAST_LINE));
  }
  return lines;
}
