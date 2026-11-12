# pi-train-progress

Show training progress from a log file inside pi.

## What it does

When a session has a selected log, the extension reads the end of that log every two seconds.
It shows one progress line above the editor and a short status in the footer.
An optional owner line names the session that started the run.
The widget is off until you select a log with `/train` or the launcher registers one.

```text
run b0_shuffled_l4
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

The extension looks for a per-session registry entry at session start.
If the entry exists, it enables the widget automatically.
Otherwise, run `/train` in the session that should show it.

```text
/train                         Enable and show the current log.
/train F:/tmp/tune_full.log    Use another log.
/train on                      Enable monitoring with the current path.
/train off                     Disable monitoring, clear the widget, and remove the registry entry.
```

The default log is `F:/tmp/tune_full.log`.
Set `PI_TRAIN_LOG` to change the default.

Logs that print `epoch 3/20 step 900/1798 loss 0.088` move the bar inside the
epoch.
Without a step field the bar moves once per epoch.

Without `/train <path>`, the widget follows the most recently written `.log`
in the directory of the current path (default `F:/tmp`).
A new run therefore appears on its own; `/train <path>` pins one file.

`/train` writes the registry entry for the current session.
The selection survives `/reload`.
`/train off` deletes it.

To enable monitoring at launch, pass the flag explicitly:

```bash
pi --train-log F:/tmp/tune_full.log
```

Without a registry entry or flag, a session shows no training UI.

## Auto start

The launcher registers the log for the session that starts the training:

```bash
LOG=/f/tmp/b0.log
REGISTRY_DIR="${PI_TRAIN_REGISTRY_DIR:-$HOME/.pi/agent/train-progress}"

if [ -n "${PI_SESSION_ID:-}" ]; then
  mkdir -p "$REGISTRY_DIR"
  printf '%s\n' "$LOG" > "$REGISTRY_DIR/$PI_SESSION_ID"
fi
```

The registry file contains one line: the log path.
The default directory is `~/.pi/agent/train-progress`.
Set `PI_TRAIN_REGISTRY_DIR` to an absolute path in both pi and the launcher to
move it.

The extension reads the registry at session start and polls it every two seconds.
A training started later in the same session appears without `/train`.
Git Bash paths such as `/f/tmp/b0.log` are accepted.
Other sessions do not read this entry.

A launcher outside pi has no `PI_SESSION_ID`, so it does not register the log.
Use `/train` in that case.

If one session starts several runs, the registry points to the latest log and
the widget switches to it.
`/train off` deletes the entry.

## Log format

The extension reads the last 16 KiB and uses the last epoch line.

LogFormer style: epoch and metrics on one line.
Durations can use seconds, minutes, or hours: `(103s)`, `95s/ep`, `1m40s/ep`, `1h2m/ep`.

```text
epoch 11/20 loss 0.0249 (107s)
```

KT style: zero-based `epoch: N`, with metrics on following lines.
Total comes from `num_epochs`; speed comes from tqdm `s/it`.

```text
epoch: 3

train loss = 216.6786, auc=0.8258, accuracy=0.7791

valid auc=0.7883, accuracy=0.7507
```

It shows up to three metrics: `loss`, `valid auc`, `auc`, then `acc`.
A zero-based `epoch: 3` is displayed one higher than the raw number.

If no epoch line exists, it shows the last non-empty line.

## Run label

The run line says which run the log belongs to. It comes from the last marker
line above the current epoch:

```text
=== run b0_shuffled_l4 | 10:56
```

Print that line from the launcher script before each arm. Without a marker, the
label is the log file name without its extension (`F:/tmp/b0.log` → `b0`).

A finished arm also shows its checkpoint, taken from the `checkpoint ->` line:

```text
run b0_shuffled_l4
train 20/20 [####################] 100%  loss 0.0238  49s/ep  ETA 0s
out: runs/b0_shuffled_l4.pt
```

## Owner

The widget can show which session started the run. The launcher writes a
sidecar file next to the log:

```bash
LOG=/f/tmp/b0.log

{
  printf 'session=%s\n' "${PI_SESSION_ID:-unknown}"
  printf 'cwd=%s\n' "$PWD"
  printf 'started=%s\n' "$(date -Is)"
} > "$LOG.owner"
```

The widget then adds one line:

```text
owner 01a1a792-f89a-741c-80c5-ca91acd3dc86  F:\Project-Research
run b0_shuffled_l4
train 20/20 [####################] 100%  loss 0.0238  49s/ep  ETA 0s
```

`PI_SESSION_ID` is set by pi in the shell that starts the training. A launch
from a normal terminal writes `unknown`. The `started` field is for humans;
the extension ignores it.

Write the sidecar every time you truncate the log. A missing or invalid sidecar
only removes the owner line. It does not stop progress updates.

Auto start uses a separate registry file. The sidecar only adds the owner line.

## Limits

- The widget is off until the session has a registry entry or `/train`.
- Auto start needs a launcher that runs inside pi and writes the registry.
- The owner line appears only when `<log>.owner` exists.
- A registry entry for a missing log shows `train waiting for <file>`.
- The widget is visible in TUI and RPC modes.
- Print and JSON modes have no UI.
- The extension reads the log, the optional owner sidecar, and the session registry.
  It does not start or stop training.
- The extension polls the log and registry every two seconds.

## Development

The repository has no runtime dependencies.
Run the unit tests:

```bash
pnpm test
```

Test the extension with `pi -e`.
