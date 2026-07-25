import pino from "pino";
import pretty from "pino-pretty";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "trace",
  },
  pretty({
    colorize: false, // no ANSI colors in log files
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
  })
);