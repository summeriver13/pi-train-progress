import { basename } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  cleanPath,
  errorMessage,
  formatOwnerLines,
  isNotFound,
  MAX_LAST_LINE,
  readOwner,
  readTail,
} from "./log.ts";
import type { OwnerRead } from "./log.ts";
import { formatProgress, parseProgress, runTitle, truncate } from "./progress.ts";
import type { TrainingProgress } from "./progress.ts";
import { readRegistryLog, removeRegistryLog, writeRegistryLog } from "./registry.ts";

const DEFAULT_LOG_PATH = process.env.PI_TRAIN_LOG?.trim() || "F:/tmp/tune_full.log";
const STATUS_KEY = "train-progress";
const WIDGET_KEY = "train-progress";
const REFRESH_INTERVAL_MS = 2_000;
const TAIL_BYTES = 16 * 1024;
const OWNER_SUFFIX = ".owner";

export { DEFAULT_LOG_PATH };

export class TrainProgressMonitor {
  private logPath: string;
  private enabled = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private autoTimer: ReturnType<typeof setInterval> | undefined;
  private ctx: ExtensionContext | undefined;
  private sessionId: string | undefined;
  private reading = false;
  private checking = false;
  private selectionVersion = 0;
  private registryError: string | undefined;

  constructor(initialPath: string) {
    this.logPath = initialPath;
  }

  getPath(): string {
    return this.logPath;
  }

  attach(ctx: ExtensionContext, sessionId: string): void {
    this.ctx = ctx;
    this.sessionId = sessionId;
  }

  async enable(path?: string): Promise<void> {
    if (path !== undefined && path.trim().length > 0) {
      this.setPath(cleanPath(path));
    }
    this.watchRegistry();
    await this.enableAndRefresh();
    await this.persistSelection();
  }

  async disable(): Promise<void> {
    this.stop();
    await this.clearSelection();
  }

  async restore(): Promise<void> {
    this.watchRegistry();
    await this.checkRegistry();
  }

  dispose(): void {
    this.stop();
  }

  private setPath(path: string): void {
    this.logPath = path;
    this.selectionVersion += 1;
  }

  private watchRegistry(): void {
    if (this.sessionId === undefined || this.autoTimer !== undefined) return;

    this.autoTimer = setInterval(() => {
      void this.checkRegistry();
    }, REFRESH_INTERVAL_MS);
    this.unref(this.autoTimer);
  }

  private unref(timer: ReturnType<typeof setInterval>): void {
    (timer as { unref?: () => void }).unref?.();
  }

  private start(): void {
    this.enabled = true;
    if (this.timer !== undefined) return;

    this.timer = setInterval(() => {
      void this.refresh();
    }, REFRESH_INTERVAL_MS);
    this.unref(this.timer);
  }

  private stop(): void {
    this.enabled = false;
    this.selectionVersion += 1;

    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.autoTimer !== undefined) {
      clearInterval(this.autoTimer);
      this.autoTimer = undefined;
    }
    this.clearUi();
  }

  private async enableAndRefresh(): Promise<void> {
    this.start();
    await this.refresh();
  }

  private async checkRegistry(): Promise<void> {
    if (this.ctx === undefined || !this.ctx.hasUI || this.reading || this.checking) return;
    if (this.sessionId === undefined) return;

    this.checking = true;
    const version = this.selectionVersion;
    try {
      const logPath = await readRegistryLog(this.sessionId);
      this.registryError = undefined;
      if (logPath === undefined || version !== this.selectionVersion) return;

      const nextPath = cleanPath(logPath);
      if (nextPath.length === 0) return;
      if (nextPath === this.logPath && this.enabled) return;

      this.logPath = nextPath;
      if (version !== this.selectionVersion) return;

      if (this.enabled) {
        await this.refresh();
      } else {
        await this.enableAndRefresh();
      }
      if (version !== this.selectionVersion) return;
      this.ctx?.ui.notify("Training log: " + this.logPath, "info");
    } catch (error) {
      this.reportRegistryError(error);
    } finally {
      this.checking = false;
    }
  }

  private async persistSelection(): Promise<void> {
    if (this.sessionId === undefined) return;

    try {
      await writeRegistryLog(this.sessionId, this.logPath);
    } catch (error) {
      this.reportRegistryError(error);
    }
  }

  private async clearSelection(): Promise<void> {
    if (this.sessionId === undefined) return;

    try {
      await removeRegistryLog(this.sessionId);
    } catch (error) {
      this.reportRegistryError(error);
    }
  }

  private reportRegistryError(error: unknown): void {
    const message = errorMessage(error);
    if (this.registryError === message) return;

    this.registryError = message;
    this.ctx?.ui.notify("Train registry: " + truncate(message, MAX_LAST_LINE), "warning");
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

    let owner: OwnerRead = {};

    this.reading = true;
    try {
      owner = await readOwner(this.logPath + OWNER_SUFFIX);
      if (!this.enabled) return;
      const text = await readTail(this.logPath, TAIL_BYTES);
      if (!this.enabled) return;
      this.render(text, owner);
    } catch (error) {
      if (!this.enabled) return;
      this.renderError(error, owner);
    } finally {
      this.reading = false;
    }
  }

  private render(text: string, owner: OwnerRead): void {
    const ownerLines = formatOwnerLines(owner);

    if (text.trim().length === 0) {
      this.show([...ownerLines, "train  waiting for " + basename(this.logPath)], "train waiting");
      return;
    }

    const lines = text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    const progress = parseProgress(lines);

    if (progress !== undefined) {
      this.showProgress(progress, lines, ownerLines);
      return;
    }

    const lastLine = lines[lines.length - 1] ?? "";
    this.show([...ownerLines, "train  " + truncate(lastLine, MAX_LAST_LINE)], "train");
  }

  private showProgress(
    progress: TrainingProgress,
    lines: string[],
    ownerLines: string[],
  ): void {
    const lastLine = lines[lines.length - 1];
    const widgetLines = [
      ...ownerLines,
      "run " + runTitle(progress, this.logPath),
      formatProgress(progress),
    ];
    if (progress.outPath !== undefined) {
      widgetLines.push("out: " + progress.outPath);
    }
    if (lastLine !== undefined && lastLine !== progress.lastLine) {
      widgetLines.push("last: " + truncate(lastLine, MAX_LAST_LINE));
    }
    const status =
      progress.total === undefined
        ? "train " + progress.current
        : "train " + progress.current + "/" + progress.total;
    this.show(widgetLines, status);
  }

  private renderError(error: unknown, owner: OwnerRead): void {
    const ownerLines = formatOwnerLines(owner);
    if (isNotFound(error)) {
      this.show(
        [...ownerLines, "train  waiting for " + basename(this.logPath)],
        "train waiting",
      );
      return;
    }
    this.show(
      [...ownerLines, "train  " + truncate(errorMessage(error), MAX_LAST_LINE)],
      "train error",
    );
  }
}
