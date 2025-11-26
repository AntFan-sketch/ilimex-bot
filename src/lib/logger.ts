// src/lib/logger.ts

import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "ilimex-bot.log.jsonl");

// Ensure the logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

export interface IlimexBotLogEntry {
  timestamp: string;
  mode: "public" | "internal";
  userMessage: string;
  assistantMessage: string;
  latencyMs: number;
}

export function logInteraction(entry: IlimexBotLogEntry) {
  const line = JSON.stringify(entry);
  fs.appendFile(LOG_FILE, line + "\n", (err) => {
    if (err) {
      console.error("Failed to write IlimexBot log entry:", err);
    }
  });
}
