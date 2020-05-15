/* eslint-disable @typescript-eslint/camelcase */
import util from "util";

import winston, { format } from "winston";
import axios from "axios";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

const test = async (): Promise<void> => {
  const dirOptions = {
    mode: "cookie" as AuthModes,
    url: "http://api.satirev.org/",
    project: "satire-v",
    token: "letmeinyoubitch",
  };
  const sdk = new SDK(dirOptions);
  const defaultFormat = format.combine(
    format.timestamp({ format: "longTime" }),
    format.ms(),
    format.align(),
    format.errors({ stack: true }),
    format.splat(),
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
      }),
      new winston.transports.Console({
        format: format.colorize({ all: true }),
        level: "info",
      }),
    ],
  });

  winston.loggers
    .get("logger")
    .warn("testing this syntax with %s and %o", "string", new Error("help"));

  const res = await sdk.getFiles({ fields: "id", limit: -1 });

  // console.log(res);
};
test();
