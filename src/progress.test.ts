import assert from "node:assert/strict";
import test from "node:test";
import { formatProgress, parseProgress } from "./progress.ts";

test("parseProgress uses the last epoch line", () => {
  const progress = parseProgress([
    "epoch 10/20 loss 0.0301 (110s)",
    "epoch 11/20 loss 0.0249 (107s)",
    "saved HDFS_full_testing.npz | sequences=460049",
  ]);

  assert.deepEqual(progress, {
    current: 11,
    total: 20,
    loss: "0.0249",
    secondsPerEpoch: 107,
    lastLine: "epoch 11/20 loss 0.0249 (107s)",
  });
});

test("parseProgress accepts seconds per epoch", () => {
  const progress = parseProgress(["epoch 3/8 loss=0.125 95s/epoch"]);

  assert.equal(progress?.current, 3);
  assert.equal(progress?.total, 8);
  assert.equal(progress?.loss, "0.125");
  assert.equal(progress?.secondsPerEpoch, 95);
});

test("parseProgress ignores lines without a valid epoch", () => {
  assert.equal(parseProgress(["epoch 0/0", "no progress here"]), undefined);
});

test("formatProgress includes the bar and ETA", () => {
  const line = formatProgress({
    current: 11,
    total: 20,
    loss: "0.0249",
    secondsPerEpoch: 107,
    lastLine: "epoch 11/20 loss 0.0249 (107s)",
  });

  assert.match(line, /^train 11\/20 \[#{11}-{9}\]\s+55%/);
  assert.match(line, /loss 0\.0249/);
  assert.match(line, /ETA 16m03s/);
});
