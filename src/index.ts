import { open } from "node:fs/promises";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatProgress, parseProgress, truncate } from "./progress.ts";
import type { TrainingProgress } from "./progress.ts";

const DEFAULT_LOG_PATH = process.env.PI_TRAIN_LOG?.trim() || "F:/tmp/tune_full.log";
const STATUS_KEY = "train-progress";
const WIDGET_KEY = "train-progress";
const REFRESH_INTERVAL_MS = 2_000;
const TAIL_BYTES = 16 * 1024;
const MAX_LAST_LINE = 110;

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readTail(path: string, maxBytes: number): Promise<string> {
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

function cleanPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed.charAt(0);
  const last = trimmed.charAt(trimmed.length - 1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

class TrainProgressMonitor {
  private logPath: string;
  private enabled = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ctx: ExtensionContext | undefined;
  private reading = false;

  constructor(initialPath: string) {
    this.logPath = initialPath;
  }

  getPath(): string {
    return this.logPath;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setContext(ctx: ExtensionContext): void {
    this.ctx = ctx;
  }

  setPath(path: string): void {
    this.logPath = path;
  }

  start(): void {
    this.enabled = true;
    if (this.timer !== undefined) return;

    this.timer = setInterval(() => {
      void this.refresh();
    }, REFRESH_INTERVAL_MS);
    (this.timer as { unref?: () => void }).unref?.();
  }

  stop(): void {
    this.dispose();
    this.clearUi();
  }

  dispose(): void {
    this.enabled = false;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async enableAndRefresh(): Promise<void> {
    this.start();
    await this.refresh();
  }

  private clearUi(): void {
    if (this.ctx === undefined || !this.ctx.hasUI) return;
    this.ctx.ui.setWidget(WIDGET_KEY, undefined);
    this.ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  private show(lines: string[], status: string): void {
    if (this.ctx === undefined || !this.ctx.hasUI) return;
    this.ctx.ui.setWidget(WIDGET_KEY, lines);
    this.ctx.ui.setStatus(STATUS_KEY, status);
  }

  private async refresh(): Promise<void> {
    if (!this.enabled || this.ctx === undefined || !this.ctx.hasUI || this.reading) return;

    this.reading = true;
    try {
      const text = await readTail(this.logPath, TAIL_BYTES);
      if (!this.enabled) return;
      this.render(text);
    } catch (error) {
      if (!this.enabled) return;
      this.renderError(error);
    } finally {
      this.reading = false;
    }
  }

  private render(text: string): void {
    if (text.trim().length === 0) {
      this.show(["train  waiting for " + basename(this.logPath)], "train waiting");
      return;
    }

    const lines = text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    const progress = parseProgress(lines);

    if (progress !== undefined) {
      this.showProgress(progress, lines);
      return;
    }

    const lastLine = lines[lines.length - 1] ?? "";
    this.show(["train  " + truncate(lastLine, MAX_LAST_LINE)], "train");
  }

  private showProgress(progress: TrainingProgress, lines: string[]): void {
    const lastLine = lines[lines.length - 1];
    const widgetLines = [formatProgress(progress)];
    if (lastLine !== undefined && lastLine !== progress.lastLine) {
      widgetLines.push("last: " + truncate(lastLine, MAX_LAST_LINE));
    }
    const status =
      progress.total === undefined
        ? "train " + progress.current
        : "train " + progress.current + "/" + progress.total;
    this.show(widgetLines, status);
  }

  private renderError(error: unknown): void {
    if (isNotFound(error)) {
      this.show(["train  waiting for " + basename(this.logPath)], "train waiting");
      return;
    }
    this.show(["train  " + truncate(errorMessage(error), MAX_LAST_LINE)], "train error");
  }
}

export default function trainProgressExtension(pi: ExtensionAPI): void {
  const monitor = new TrainProgressMonitor(DEFAULT_LOG_PATH);

  pi.registerFlag("train-log", {
    description: "Path to a training log; enables progress for this session",
    type: "string",
  });

  pi.registerCommand("train", {
    description: "Show training progress from a log file",
    handler: async (args, commandCtx) => {
      monitor.setContext(commandCtx);
      const value = cleanPath(args);

      if (value === "off") {
        monitor.stop();
        commandCtx.ui.notify("Training progress off", "info");
        return;
      }

      if (value.length > 0 && value !== "on") {
        monitor.setPath(value);
      }

      await monitor.enableAndRefresh();
      commandCtx.ui.notify("Training log: " + monitor.getPath(), "info");
    },
  });

  pi.on("session_start", async (_event, sessionCtx) => {
    monitor.setContext(sessionCtx);
    const flagValue = pi.getFlag("train-log");
    if (typeof flagValue === "string" && flagValue.trim().length > 0) {
      monitor.setPath(cleanPath(flagValue));
      await monitor.enableAndRefresh();
    }
  });

  pi.on("session_shutdown", () => {
    monitor.dispose();
  });
}
