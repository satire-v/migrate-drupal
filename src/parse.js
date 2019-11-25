// @flow
import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const fs = require('fs');

const cliProgress = require('cli-progress');
const yargs = require('yargs');

const database = require('./database');
const directus = require('./directus');
const drupal = require('./drupal');

const { argv } = yargs
  .option('db', {
    alias: 'd',
    description: 'The local database to query from',
    type: 'string',
    default: 'satirevdrupal',
  })
  .option('password', {
    alias: 'p',
    description: 'The password to the local database',
    type: 'string',
  })
  .option('article_count', {
    alias: 'n',
    description: 'Number of articles to write to import',
    type: 'number',
    default: null,
  })
  .help()
  .alias('help', 'h')
  .demandOption(
    ['password'],
    'Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)',
  );

const getDrupal = (db: Obj): Promise<Array<DrupalArticle>> => drupal.getAllArticles(db);

const main = async () => {
  const db = await database.newLocalDB(argv.db, argv.password);
  const categoryMap = await drupal.getDrupalCategoriesMap(db);
  const catQuery = directus.createCategoriesImport(categoryMap);
  const deleteArticles = 'DELETE FROM articles;\n';
  const articles: Array<DrupalArticle> = await getDrupal(db);
  const bar = new cliProgress.SingleBar({ format: 'Articles parsed: {value}/{total}' });
  bar.start(argv.n ?? articles.length, 0);
  const articleQueryArray = [];
  const articlesToGet = argv.n ? articles.slice(0, argv.n) : articles;
  articlesToGet.forEach((article) => {
    articleQueryArray.push(directus.createArticleValueSetQuery(db, article, categoryMap, bar));
  });

  const articlesProcessed = await Promise.all(articleQueryArray);
  fs.writeFile(
    'import.sql',
    `${(await catQuery)
      + deleteArticles
      + directus.insertArticleStart
      + articlesProcessed.join(',')};`,
    (err) => {
      if (err) throw err;
    },
  );
  bar.stop();
  await db.end();
};

main();
