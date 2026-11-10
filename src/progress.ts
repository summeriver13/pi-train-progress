const BAR_WIDTH = 20;

const EPOCH_LINE_PATTERN = /\bepoch\s+(\d+)\s*\/\s*(\d+)\b/i;
const LOSS_PATTERN = /\bloss\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i;
const SECONDS_PATTERN = /\((\d+(?:\.\d+)?)\s*s\)|(\d+(?:\.\d+)?)\s*s\/ep(?:och)?/i;

export interface TrainingProgress {
  current: number;
  total: number;
  loss?: string;
  secondsPerEpoch?: number;
  lastLine: string;
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
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    const epochMatch = EPOCH_LINE_PATTERN.exec(line);
    if (epochMatch === null) continue;

    const current = Number(epochMatch[1]);
    const total = Number(epochMatch[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) continue;

    const lossMatch = LOSS_PATTERN.exec(line);
    const secondsMatch = SECONDS_PATTERN.exec(line);
    const seconds = secondsMatch?.[1] ?? secondsMatch?.[2];
    return {
      current,
      total,
      loss: lossMatch?.[1],
      secondsPerEpoch: seconds === undefined ? undefined : Number(seconds),
      lastLine: line,
    };
  }
  return undefined;
}

export function formatProgress(progress: TrainingProgress): string {
  const ratio = Math.min(1, Math.max(0, progress.current / progress.total));
  const filled = Math.round(ratio * BAR_WIDTH);
  const bar = "#".repeat(filled) + "-".repeat(BAR_WIDTH - filled);
  const percent = String(Math.round(ratio * 100)).padStart(3, " ");
  const loss = progress.loss === undefined ? "" : "  loss " + progress.loss;
  const speed =
    progress.secondsPerEpoch === undefined
      ? ""
      : "  " + formatDuration(progress.secondsPerEpoch) + "/ep";
  const remaining = Math.max(0, progress.total - progress.current);
  const eta =
    progress.secondsPerEpoch === undefined
      ? ""
      : "  ETA " + formatDuration(progress.secondsPerEpoch * remaining);
  return (
    "train " +
    progress.current +
    "/" +
    progress.total +
    " [" +
    bar +
    "] " +
    percent +
    "%" +
    loss +
    speed +
    eta
  );
}
