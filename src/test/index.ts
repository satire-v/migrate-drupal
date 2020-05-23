/* eslint-disable @typescript-eslint/camelcase */
import util from "util";

import winston, { format } from "winston";
import axios from "axios";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

import DB from "../database";

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

    exitOnError: false,
  });

  const logger = winston.loggers.get("logger");

  // const res = await sdk.getFiles({ fields: "filename_download", limit: -1 });
  await DB.connect("satirevdrupal", "fillerpassword");
  const res = await DB.db.query(
    `SELECT
        n.nid,
        urls.alias as relative_uri
      FROM
        node n
        LEFT JOIN url_alias urls ON urls.source = CONCAT('node/', n.nid)
      WHERE n.type = 'article' AND urls.source LIKE 'node%'
      GROUP BY n.nid,
        relative_uri`
  );
  const res2 = await DB.db.query(
    `SELECT * FROM url_alias WHERE source = 'node/716'`
  );
  const parsedGroup = JSON.parse(JSON.stringify(res[0])).map(e => e.nid);
  const parsedRaw = JSON.parse(JSON.stringify(res2[0])).map(e => e.nid);
  const findDuplicates = arr =>
    arr.filter((item, index) => arr.indexOf(item) != index);

  const diff = findDuplicates(parsedGroup);
  await DB.db.end();
  console.log(parsedGroup);
};
test();
