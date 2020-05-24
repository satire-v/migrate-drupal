import fs from "fs";

import Bluebird from "bluebird";

import progress from "./progress";
import logger from "./logger";
import DrupalArticle, { ArticleData } from "./drupal/article";
import Directus from "./directus";
import DB from "./database";
import args from "./args";

export const FILE_TIMEOUT = 15000;

async function main(): Promise<void> {
  await Directus.deleteImages();
  logger.info("Deleted existing images");

  const categoryMap = await DrupalArticle.genDrupalCategoriesMap();
  Directus.Init(categoryMap); // Make instance? ugh

  const articles: Array<ArticleData> = await DrupalArticle.genAllArticles(); // TODO: limit sql query
  progress.ArticlesBarTotal = args.articleCount || articles.length;

  // TODO: asynchronously pass each articledata to Article instance, await parse
  // then pass instnace to directus to create query, which should be pretty straight forward
  // Directus should be instance of itself, so that article can import it to upload image

  const articlesToGet = args.articleCount
    ? articles.slice(0, args.articleCount)
    : articles;

  const articlesProcessed = await Bluebird.map(
    articlesToGet,
    article => Directus.createArticleImportQuery(article),
    { concurrency: args.concurrency }
  );

  const deleteArticles = "DELETE FROM articles;\n";
  const categoryQuery = Directus.createCategoriesImport(categoryMap);

  fs.writeFile(
    "import.sql",
    `${(await categoryQuery) +
      deleteArticles +
      Directus.insertArticleStart +
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

  progress.stop();
  await DB.end();
}

main();
