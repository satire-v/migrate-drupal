import fs from "fs";

import mysql2, { Pool } from "mysql2/promise";
import Bluebird from "bluebird";

import progress from "../progress";
import { DRUPAL_DATABASE } from "../index";

import Drupal, { ArticleData } from "./drupal/article";
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
  const db = pool(mysqlPwd);
  const drupal = new Drupal(db);
  await directus.deleteImages();
  const articles: Array<ArticleData> = await drupal.Article.genAllArticles(
    articleCount
  );
  progress.ArticlesBarTotal = articleCount || articles.length;

  const articlesProcessed = await Bluebird.map(
    articles,
    async article => {
      const Article = new drupal.Article(article);
      return await directus.createArticleImportQuery(Article);
    },
    { concurrency }
  );

  const deleteArticles = "DELETE FROM articles;\n";
  const categoryQuery = directus.categoriesImport(
    await drupal.Article.categoryMap
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
  await db.end();
}
