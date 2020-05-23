import fs from "fs";

import Bluebird from "bluebird";

import logger from "./logger";
import Drupal, { DrupalArticle, globals } from "./drupal";
import Directus from "./directus";
import DB from "./database";
import args from "./args";

async function main(): Promise<void> {
  const drupal = new Drupal();
  const directus = new Directus();
  const categoryMap = await drupal.genDrupalCategoriesMap();
  const catQuery = Directus.createCategoriesImport(categoryMap);
  const deleteArticles = "DELETE FROM articles;\n";
  const ids = await directus.getImageIds();
  if (ids.data.length !== 0) await directus.deleteImages(ids.data);
  logger.info("Deleted existing images");
  const articles: Array<DrupalArticle> = await drupal.genAllArticles();
  globals.articleProgressBar.setTotal(args.articleCount || articles.length);
  const articlesToGet = args.articleCount
    ? articles.slice(0, args.articleCount)
    : articles;
  const articlesProcessed = await Bluebird.map(
    articlesToGet,
    article => directus.createArticleImportQuery(article, categoryMap),
    { concurrency: args.concurrency }
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
  await DB.stop();
}

main();
