import { Effect } from "effect";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

export interface Logger {
  readonly log: (level: LogLevel, message: string, data?: Record<string, unknown>) => void;
  readonly debug: (message: string, data?: Record<string, unknown>) => void;
  readonly info: (message: string, data?: Record<string, unknown>) => void;
  readonly warn: (message: string, data?: Record<string, unknown>) => void;
  readonly error: (message: string, data?: Record<string, unknown>) => void;
}

class LoggerService extends Effect.Service<LoggerService>()("LoggerService", {
  effect: Effect.gen(function* () {
    const logLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];

    const shouldLog = (level: LogLevel): boolean => {
      const currentIndex = levels.indexOf(logLevel);
      const messageIndex = levels.indexOf(level);
      return messageIndex >= currentIndex;
    };

    const formatTimestamp = (): string => {
      return new Date().toISOString();
    };

    const log = (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
      if (!shouldLog(level)) return;

      const entry: LogEntry = {
        timestamp: formatTimestamp(),
        level,
        message,
        data,
      };

      if (process.env.LOG_FORMAT === "json") {
        console.log(JSON.stringify(entry));
      } else {
        const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
        if (data) {
          console.log(`${prefix} ${message}`, JSON.stringify(data));
        } else {
          console.log(`${prefix} ${message}`);
        }
      }
    };

    const debugFn = (message: string, data?: Record<string, unknown>): void => {
      log("debug", message, data);
    };
    const infoFn = (message: string, data?: Record<string, unknown>): void => {
      log("info", message, data);
    };
    const warnFn = (message: string, data?: Record<string, unknown>): void => {
      log("warn", message, data);
    };
    const errorFn = (message: string, data?: Record<string, unknown>): void => {
      log("error", message, data);
    };

    return {
      log,
      debug: debugFn,
      info: infoFn,
      warn: warnFn,
      error: errorFn,
    };
  }),
  dependencies: [],
}) {}

export const LoggerLive = LoggerService.Default;

export function debug(message: string, data?: Record<string, unknown>): void {
  if (process.env.LOG_LEVEL === "debug") {
    const timestamp = new Date().toISOString();
    if (process.env.LOG_FORMAT === "json") {
      console.log(JSON.stringify({ timestamp, level: "debug", message, data }));
    } else {
      console.log(`[${timestamp}] [DEBUG] ${message}`, data ? JSON.stringify(data) : "");
    }
  }
}

export function info(message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  if (process.env.LOG_FORMAT === "json") {
    console.log(JSON.stringify({ timestamp, level: "info", message, data }));
  } else {
    console.log(`[${timestamp}] [INFO] ${message}`, data ? JSON.stringify(data) : "");
  }
}

export function error(message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  if (process.env.LOG_FORMAT === "json") {
    console.error(JSON.stringify({ timestamp, level: "error", message, data }));
  } else {
    console.error(`[${timestamp}] [ERROR] ${message}`, data ? JSON.stringify(data) : "");
  }
}

export function warn(message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  if (process.env.LOG_FORMAT === "json") {
    console.log(JSON.stringify({ timestamp, level: "warn", message, data }));
  } else {
    console.log(`[${timestamp}] [WARN] ${message}`, data ? JSON.stringify(data) : "");
  }
}

export const logger = {
  debug,
  info,
  error,
  warn,
};
