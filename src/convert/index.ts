import fs from "fs";

import mysql2, { Pool } from "mysql2/promise";
import Bluebird from "bluebird";

import progress from "../progress";
import logger from "../logger";
import { DRUPAL_DATABASE, DIRECTUS_IMPORT_FILE } from "../index";

import { initArticle, ArticleData } from "./drupal/article";
import directus from "./directus";

export const FILE_TIMEOUT = 15000;

function pool(mysqlPwd: string): Pool {
  return mysql2.createPool({
    host: "localhost",
    user: "root",
    database: DRUPAL_DATABASE,
    password: mysqlPwd,
    connectionLimit: 10,
  });
}

export async function convert(
  articleCount: number,
  concurrency: number,
  mysqlPwd: string
): Promise<void> {
  logger.info("CONVERT");
  const db = pool(mysqlPwd);
  const Article = await initArticle(db);
  await directus.deleteImages();
  const articles: Array<ArticleData> = await Article.genAllArticles(
    articleCount
  );
  progress.ArticlesBarTotal = articleCount || articles.length;

  const articlesProcessed = await Bluebird.map(
    articles,
    async article => {
      const ArticleInstance = new Article(article);
      return await directus.createArticleImportQuery(ArticleInstance);
    },
    { concurrency }
  );

  const deleteArticles = "DELETE FROM articles;\n";
  const categoryQuery = directus.categoriesImport(Article.categoryMap);

  fs.writeFile(
    DIRECTUS_IMPORT_FILE,
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
  await db.end();
  logger.info("DONE CONVERTING");
}
