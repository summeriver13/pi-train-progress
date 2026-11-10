import { truncate } from "./progress.ts";

const MAX_CWD_LENGTH = 48;

export interface TrainingOwner {
  session?: string;
  cwd?: string;
}

export function parseOwner(text: string): TrainingOwner | undefined {
  const owner: TrainingOwner = {};

  for (const line of text.split(/\r\n|\r|\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (value.length === 0) continue;

    if (key === "session") {
      owner.session = value;
    } else if (key === "cwd") {
      owner.cwd = value;
    }
  }

  if (owner.session === undefined && owner.cwd === undefined) return undefined;
  return owner;
}

export function formatOwner(owner: TrainingOwner): string | undefined {
  if (owner.session === undefined && owner.cwd === undefined) return undefined;

  const session = owner.session ?? "unknown";
  if (owner.cwd === undefined) return "owner " + session;
  return "owner " + session + "  " + truncate(owner.cwd, MAX_CWD_LENGTH);
}
