import fs from "fs";

import yargs from "yargs";
import Bluebird from "bluebird";

import Drupal, { DrupalArticle } from "./drupal";
import Directus from "./directus";
import database from "./database";

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

const getDrupal = (drupal: Drupal): Bluebird<Array<DrupalArticle>> =>
  drupal.genAllArticles();

async function main(): Bluebird<void> {
  const db = await database.newLocalDB(argv.db, argv.password);

  const drupal = new Drupal(db, true);
  const directus = new Directus(drupal);
  const categoryMap = await drupal.genDrupalCategoriesMap();
  const catQuery = Directus.createCategoriesImport(categoryMap);
  const deleteArticles = "DELETE FROM articles;\n";
  const ids = await Directus.getImageIds();
  if (ids.data.length !== 0) await Directus.deleteImages(ids.data);
  drupal.fileDebugStream.write("Deleted existing images\n");
  const articles: Array<DrupalArticle> = await getDrupal(drupal);
  drupal.createArticleProgressBar(argv.articleCount ?? articles.length);
  drupal.createFilesProgressBar();
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
  drupal.fileDebugStream.end("DONE");
  drupal.stopMultibar();
  await drupal.stopDB();
}

main();
