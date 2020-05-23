import util from "util";
import fs from "fs";

import yargs from "yargs";
import winston, { format } from "winston";
import Bluebird from "bluebird";

import Drupal, { DrupalArticle, globals } from "./drupal";
import Directus from "./directus";
import DB from "./database";

const { argv } = yargs
  .option("db", {
    alias: "d",
    description: "The local database to query from",
    type: "string",
    default: "satirevdrupal",
  })
  .option("password", {
    alias: "p",
    description: "The password to the local database",
    type: "string",
  })
  .option("articleCount", {
    alias: "n",
    description: "Number of articles to write to import",
    type: "number",
    default: undefined,
  })
  .option("concurrency", {
    alias: "c",
    description: "Concurrency of article processing",
    type: "number",
    default: 10,
  })
  .help()
  .alias("help", "h")
  .demandOption(
    ["password"],
    "Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)"
  );

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
fs.unlinkSync("combined.log");
fs.unlinkSync("debug.log");

const logger = winston.loggers.get("logger");

async function main(): Promise<void> {
  await DB.connect(argv.db, argv.password);
  const drupal = new Drupal();
  const directus = new Directus();
  const categoryMap = await drupal.genDrupalCategoriesMap();
  const catQuery = Directus.createCategoriesImport(categoryMap);
  const deleteArticles = "DELETE FROM articles;\n";
  const ids = await directus.getImageIds();
  if (ids.data.length !== 0) await directus.deleteImages(ids.data);
  logger.info("Deleted existing images");
  const articles: Array<DrupalArticle> = await drupal.genAllArticles();
  globals.articleProgressBar.setTotal(argv.articleCount || articles.length);
  const articlesToGet = argv.articleCount
    ? articles.slice(0, argv.articleCount)
    : articles;
  const articlesProcessed = await Bluebird.map(
    articlesToGet,
    article => directus.createArticleImportQuery(article, categoryMap),
    { concurrency: argv.concurrency }
  );

  fs.writeFile(
    "import.sql",
    `${(await catQuery) +
      deleteArticles +
      Directus.insertArticleStart() +
      articlesProcessed.join(",")};`,
    err => {
      if (err) throw err;
    }
  );
  // const sentFiles = (await directus.sdk.getFiles({
  //   limit: -1,
  //   fields: "filename_download",
  // })) as any;

  // const sentFilesSet = new Set(sentFiles.data.map(e => e.filename_download));

  drupal.stopMultibar();
  await drupal.stopDB();
}

main();
