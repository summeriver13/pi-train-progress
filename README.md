# pi-train-progress

Show training progress from a log file inside pi.

## What it does

When enabled, the extension reads the end of a training log every two seconds.
It shows one progress line above the editor and a short status in the footer.
The widget is off by default. Enable it in the session that should show it.

```text
train 11/20 [##########----------]  55%  loss 0.0249  1m47s/ep  ETA 16m
last: saved HDFS_full_testing.npz | sequences=460049 | positives=13470
```

## Requirements

- pi 1.5.0 or later.
- A text log with epoch lines.

## Install

Add the extension path to `~/.pi/agent/settings.json`:

```json
{
  "extensions": [
    "F:/Project-Repos/pi-train-progress/src/index.ts"
  ]
}
```

Restart pi, or run `/reload`. For a one-off test:

```bash
pi -e F:/Project-Repos/pi-train-progress/src/index.ts
```

## Use

By default, the widget does not appear at session start.
Run `/train` in the session that should show it.

```text
/train                         Enable and show the current log.
/train F:/tmp/tune_full.log    Use another log.
/train on                      Enable monitoring with the current path.
/train off                     Disable monitoring and clear the widget.
```

The default log is `F:/tmp/tune_full.log`.
Set `PI_TRAIN_LOG` to change the default.

To enable monitoring at launch, pass the flag explicitly:

```bash
pi --train-log F:/tmp/tune_full.log
```

Without the flag, other sessions show no training UI.

## Log format

The extension reads the last 16 KiB and uses the last line with `epoch N/M`.
It reads `loss` and `(Ns)` when present.

```text
epoch 11/20 loss 0.0249 (107s)
```

If no epoch line exists, it shows the last non-empty line.

## Limits

- The widget is off by default in every session.
- The widget is visible in TUI and RPC modes.
- Print and JSON modes have no UI.
- The extension reads one local file. It does not start or stop training.
- The extension polls every two seconds.

## Development

The repository has no runtime dependencies.
Run the parser tests:

```bash
node --test src/progress.test.ts
```

Test the extension with `pi -e`.
