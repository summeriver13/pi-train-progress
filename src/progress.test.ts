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
    metrics: [{ label: "loss", value: "0.0249" }],
    secondsPerEpoch: 107,
    lastLine: "epoch 11/20 loss 0.0249 (107s)",
  });
});

test("parseProgress accepts seconds per epoch", () => {
  const progress = parseProgress(["epoch 3/8 loss=0.125 95s/epoch"]);

  assert.equal(progress?.current, 3);
  assert.equal(progress?.total, 8);
  assert.deepEqual(progress?.metrics, [{ label: "loss", value: "0.125" }]);
  assert.equal(progress?.secondsPerEpoch, 95);
});

test("parseProgress converts minute and hour durations", () => {
  const minute = parseProgress(["epoch 17/20 loss 0.0240 1m40s/ep"]);
  const hour = parseProgress(["epoch 17/20 loss 0.0240 1h2m/ep"]);
  const mixed = parseProgress(["epoch 17/20 loss 0.0240 1h2m3s/ep"]);
  const parentheses = parseProgress(["epoch 17/20 loss 0.0240 (1m40s)"]);

  assert.equal(minute?.secondsPerEpoch, 100);
  assert.equal(hour?.secondsPerEpoch, 3720);
  assert.equal(mixed?.secondsPerEpoch, 3723);
  assert.equal(parentheses?.secondsPerEpoch, 100);
  assert.ok(minute);
  assert.match(formatProgress(minute), /1m40s\/ep/);
  assert.match(formatProgress(minute), /ETA 5m/);
});

test("parseProgress ignores lines without a valid epoch", () => {
  assert.equal(parseProgress(["epoch 0/0", "no progress here"]), undefined);
});

test("parseProgress reads KT logs", () => {
  const progress = parseProgress([
    "'num_epochs': 4",
    " 25%|██▌       | 1/4 [22:20<1:07:01, 1340.45s/it]",
    "epoch: 0",
    "",
    "train loss = 250.36151123046875,auc=0.7487098296580622, accuracy=0.7383280442293506",
    "",
    "valid auc=0.7772530737838449, accuracy=0.7486575749551299, precision=[0.709 0.755], recall=[0.335 0.937]",
    "0.0000 to 0.7773",
    "Save checkpoint at 0",
  ]);

  assert.deepEqual(progress, {
    current: 1,
    total: 4,
    metrics: [
      { label: "loss", value: "250.3615" },
      { label: "valid auc", value: "0.7773" },
      { label: "auc", value: "0.7487" },
    ],
    secondsPerEpoch: 1340.45,
    lastLine: "epoch: 0",
  });
  assert.match(formatProgress(progress), /ETA 1h07m/);
});

test("parseProgress supports a KT epoch without a total", () => {
  const progress = parseProgress(["epoch: 3", "train loss = 216.67861938476562"]);

  assert.ok(progress);
  assert.equal(progress.current, 4);
  assert.equal(progress.total, undefined);
  assert.equal(formatProgress(progress), "train epoch 4  loss 216.6786");
});

test("parseProgress stops metrics at the next epoch", () => {
  const progress = parseProgress([
    "epoch: 0",
    "train loss = 1.0",
    "epoch: 1",
    "train loss = 2.0",
  ]);

  assert.equal(progress?.current, 2);
  assert.deepEqual(progress?.metrics, [{ label: "loss", value: "2" }]);
});

test("formatProgress includes the bar and ETA", () => {
  const line = formatProgress({
    current: 11,
    total: 20,
    metrics: [{ label: "loss", value: "0.0249" }],
    secondsPerEpoch: 107,
    lastLine: "epoch 11/20 loss 0.0249 (107s)",
  });

  assert.match(line, /^train 11\/20 \[#{11}-{9}\]\s+55%/);
  assert.match(line, /loss 0\.0249/);
  assert.match(line, /ETA 16m03s/);
});
