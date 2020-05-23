import util from "util";
import fs from "fs";

import winston, { format } from "winston";

const defaultFormat = format.combine(
  format.timestamp({ format: "longTime" }),
  format.ms(),
  format.align(),
  format.errors({ stack: true }),
  format.printf(info => {
    info.level = info.level.toUpperCase();
    return `[${info.timestamp}] ${info.ms
      .replace(/[ms]/gi, "")
      .padStart(6, " ")}ms ${info.level}: ${info.message} ${
      info.durationMs ? `${info.durationMs}ms` : ""
    }${info.stack ? `\n${util.format(info.stack)}\n` : ""} `;
  })
);

winston.loggers.add("logger", {
  level: "info",
  format: defaultFormat,
  transports: [
    new winston.transports.File({
      filename: "combined.log",
      level: "info",
      // handleExceptions: true,
    }),
    new winston.transports.File({
      filename: "debug.log",
      level: "debug",
    }),
    new winston.transports.Console({
      format: format.colorize({ all: true }),
      level: "info",
    }),
  ],
});
try {
  // Reset logs
  fs.unlinkSync("../logs/combined.log");
  fs.unlinkSync("../logs/debug.log");
} catch {
  // do nothing
}

export default winston.loggers.get("logger");
