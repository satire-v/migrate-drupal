import fs from "fs";

import Bluebird from "bluebird";

import progress from "./progress";
import logger from "./logger";
import DrupalArticle, { ArticleData } from "./drupal/article";
import directus from "./directus";
import DB from "./database";
import args from "./args";

export const FILE_TIMEOUT = 15000;

async function main(): Promise<void> {
  await directus.deleteImages();
  const articles: Array<ArticleData> = await DrupalArticle.genAllArticles(
    args.articleCount
  );
  progress.ArticlesBarTotal = args.articleCount || articles.length;

  const articlesProcessed = await Bluebird.map(
    articles,
    article => {
      const Article = new DrupalArticle(article);
      directus.createArticleImportQuery(Article);
    },
    { concurrency: args.concurrency }
  );

  const deleteArticles = "DELETE FROM articles;\n";
  const categoryQuery = directus.categoriesImport(
    await DrupalArticle.categoryMap
  );

  fs.writeFile(
    "import.sql",
    `${(await categoryQuery) +
      deleteArticles +
      directus.insertArticleStart +
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
