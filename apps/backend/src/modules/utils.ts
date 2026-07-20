import pino from "pino";
import pretty from "pino-pretty";

export const logger = pino(
  { level: process.env.LOG_LEVEL || "info" },
  process.env.NODE_ENV !== "production"
    ? pretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      })
    : undefined,
);