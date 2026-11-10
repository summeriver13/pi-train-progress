import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cleanPath } from "./log.ts";
import { DEFAULT_LOG_PATH, TrainProgressMonitor } from "./monitor.ts";

export default function trainProgressExtension(pi: ExtensionAPI): void {
  const monitor = new TrainProgressMonitor(DEFAULT_LOG_PATH);

  pi.registerFlag("train-log", {
    description: "Path to a training log; enables progress for this session",
    type: "string",
  });

  pi.registerCommand("train", {
    description: "Show training progress from a log file",
    handler: async (args, commandCtx) => {
      monitor.attach(commandCtx, commandCtx.sessionManager.getSessionId());
      const value = cleanPath(args);

      if (value === "off") {
        await monitor.disable();
        commandCtx.ui.notify("Training progress off", "info");
        return;
      }

      const path = value.length > 0 && value !== "on" ? value : undefined;
      await monitor.enable(path);
      commandCtx.ui.notify("Training log: " + monitor.getPath(), "info");
    },
  });

  pi.on("session_start", async (_event, sessionCtx) => {
    monitor.attach(sessionCtx, sessionCtx.sessionManager.getSessionId());
    const flagValue = pi.getFlag("train-log");
    if (typeof flagValue === "string" && flagValue.trim().length > 0) {
      await monitor.enable(flagValue);
      return;
    }

    await monitor.restore();
  });

  pi.on("session_shutdown", () => {
    monitor.dispose();
  });
}
