const BAR_WIDTH = 20;
const METRIC_WINDOW_LINES = 12;
const MAX_METRICS = 3;

const EPOCH_FRACTION_PATTERN = /\bepoch\s+(\d+)\s*\/\s*(\d+)\b/i;
const EPOCH_INDEX_PATTERN = /\bepoch\s*:\s*(\d+)\b/i;
const TOTAL_PATTERN = /['"]?num_epochs['"]?\s*[:=]\s*(\d+)/i;
const DURATION_TOKEN =
  "((?=\\d+(?:\\.\\d+)?\\s*[hms])(?:\\d+(?:\\.\\d+)?\\s*h)?\\s*(?:\\d+(?:\\.\\d+)?\\s*m)?\\s*(?:\\d+(?:\\.\\d+)?\\s*s)?)";
const DURATION_PATTERN = new RegExp(
  `\\(${DURATION_TOKEN}\\)|${DURATION_TOKEN}\\/(?:ep(?:och)?|it)`,
  "gi",
);
const VALIDATION_LINE_PATTERN = /\bvalid(?:ation)?\b/i;
const RUN_MARKER_PATTERN = /^===\s*run\s+(\S+)/;
const OUT_PATH_PATTERN = /checkpoint\s*->\s*(\S+)/;

const LOSS_PATTERN = /\b(?:train\s+)?loss\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?\d+)?)/i;
const AUC_PATTERN = /\bauc\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)/i;
const ACC_PATTERN = /\baccuracy\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)/i;
const VALID_AUC_PATTERN = /\bvalid(?:ation)?\s+auc\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)/i;
const VALID_ACC_PATTERN = /\bvalid(?:ation)?\s+accuracy\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)/i;

const METRIC_ORDER = ["loss", "valid auc", "auc", "acc", "valid acc"];

export interface TrainingMetric {
  label: string;
  value: string;
}

export interface TrainingProgress {
  current: number;
  total?: number;
  metrics: TrainingMetric[];
  secondsPerEpoch?: number;
  lastLine: string;
  runLabel?: string;
  outPath?: string;
}

interface EpochMatch {
  current: number;
  total?: number;
}

function matchEpochLine(line: string): EpochMatch | undefined {
  const fraction = EPOCH_FRACTION_PATTERN.exec(line);
  if (fraction !== null) {
    const current = Number(fraction[1]);
    const total = Number(fraction[2]);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      return { current, total };
    }
  }

  const index = EPOCH_INDEX_PATTERN.exec(line);
  if (index !== null) {
    const current = Number(index[1]);
    if (Number.isFinite(current) && current >= 0) {
      return { current: current + 1 };
    }
  }
  return undefined;
}

function parseTotal(lines: string[]): number | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = TOTAL_PATTERN.exec(lines[index]);
    if (match === null) continue;
    const total = Number(match[1]);
    if (Number.isFinite(total) && total > 0) return total;
  }
  return undefined;
}

function formatMetricValue(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toFixed(4).replace(/\.?0+$/, "");
}

function addMetric(
  metrics: Map<string, string>,
  label: string,
  pattern: RegExp,
  line: string,
): void {
  if (metrics.has(label)) return;
  const match = pattern.exec(line);
  if (match === null) return;
  metrics.set(label, formatMetricValue(match[1]));
}

function collectMetrics(lines: string[], start: number): TrainingMetric[] {
  const values = new Map<string, string>();
  const end = Math.min(lines.length, start + METRIC_WINDOW_LINES);

  for (let index = start; index < end; index += 1) {
    if (index > start && matchEpochLine(lines[index]) !== undefined) break;
    const line = lines[index];

    if (VALIDATION_LINE_PATTERN.test(line)) {
      addMetric(values, "valid auc", VALID_AUC_PATTERN, line);
      addMetric(values, "valid acc", VALID_ACC_PATTERN, line);
      continue;
    }

    addMetric(values, "loss", LOSS_PATTERN, line);
    addMetric(values, "auc", AUC_PATTERN, line);
    addMetric(values, "acc", ACC_PATTERN, line);
  }

  return METRIC_ORDER.filter((label) => values.has(label))
    .slice(0, MAX_METRICS)
    .map((label) => ({ label, value: values.get(label) ?? "" }));
}

function parseDuration(value: string): number | undefined {
  const hours = /(\d+(?:\.\d+)?)\s*h/i.exec(value);
  const minutes = /(\d+(?:\.\d+)?)\s*m(?!s)/i.exec(value);
  const seconds = /(\d+(?:\.\d+)?)\s*s/i.exec(value);
  if (hours === null && minutes === null && seconds === null) return undefined;

  const total =
    (hours === null ? 0 : Number(hours[1]) * 3600) +
    (minutes === null ? 0 : Number(minutes[1]) * 60) +
    (seconds === null ? 0 : Number(seconds[1]));
  return Number.isFinite(total) ? total : undefined;
}

function findRunLabel(lines: string[], start: number): string | undefined {
  for (let index = start; index >= 0; index -= 1) {
    const match = RUN_MARKER_PATTERN.exec(lines[index]);
    if (match !== null) return match[1];
  }
  return undefined;
}

function findOutPath(lines: string[], start: number): string | undefined {
  for (let index = lines.length - 1; index > start; index -= 1) {
    const match = OUT_PATH_PATTERN.exec(lines[index]);
    if (match !== null) return match[1];
  }
  return undefined;
}

export function runTitle(progress: TrainingProgress, logPath: string): string {
  if (progress.runLabel !== undefined) return progress.runLabel;
  const base = logPath.split(/[\\/]/).pop() ?? logPath;
  return base.replace(/\.[^.]+$/, "");
}

function findSecondsPerEpoch(lines: string[], start: number): number | undefined {
  const stop = Math.max(0, start - METRIC_WINDOW_LINES);
  for (let index = start; index >= stop; index -= 1) {
    if (index < start && matchEpochLine(lines[index]) !== undefined) return undefined;
    const matches = Array.from(lines[index].matchAll(DURATION_PATTERN));
    for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
      const value = parseDuration(matches[matchIndex][1] ?? matches[matchIndex][2]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "...";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  if (seconds < 60) return Math.round(seconds) + "s";

  const totalMinutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.round(seconds % 60);
  if (totalMinutes < 60) {
    if (remainderSeconds === 0) return totalMinutes + "m";
    return totalMinutes + "m" + String(remainderSeconds).padStart(2, "0") + "s";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours + "h" + String(minutes).padStart(2, "0") + "m";
}

export function parseProgress(lines: string[]): TrainingProgress | undefined {
  let epochIndex = -1;
  let epoch: EpochMatch | undefined;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = matchEpochLine(lines[index]);
    if (match === undefined) continue;
    epochIndex = index;
    epoch = match;
    break;
  }

  if (epoch === undefined) return undefined;

  return {
    current: epoch.current,
    total: epoch.total ?? parseTotal(lines),
    metrics: collectMetrics(lines, epochIndex),
    secondsPerEpoch: findSecondsPerEpoch(lines, epochIndex),
    lastLine: lines[epochIndex],
    runLabel: findRunLabel(lines, epochIndex),
    outPath: findOutPath(lines, epochIndex),
  };
}

export function formatProgress(progress: TrainingProgress): string {
  const total = progress.total;
  let head: string;

  if (total === undefined) {
    head = "train epoch " + progress.current;
  } else {
    const ratio = Math.min(1, Math.max(0, progress.current / total));
    const filled = Math.round(ratio * BAR_WIDTH);
    const bar = "#".repeat(filled) + "-".repeat(BAR_WIDTH - filled);
    const percent = String(Math.round(ratio * 100)).padStart(3, " ");
    head = "train " + progress.current + "/" + total + " [" + bar + "] " + percent + "%";
  }

  const metrics = progress.metrics
    .map((metric) => "  " + metric.label + " " + metric.value)
    .join("");
  const speed =
    progress.secondsPerEpoch === undefined
      ? ""
      : "  " + formatDuration(progress.secondsPerEpoch) + "/ep";
  const eta =
    total === undefined || progress.secondsPerEpoch === undefined
      ? ""
      : "  ETA " + formatDuration(progress.secondsPerEpoch * Math.max(0, total - progress.current));

  return head + metrics + speed + eta;
}
