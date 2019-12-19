// @flow
import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const fs = require('fs');

const yargs = require('yargs');

const database = require('./database');
const Directus = require('./directus');
const Drupal = require('./drupal');

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
  .option('articleCount', {
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

const getDrupal = (drupal: Obj): Promise<Array<DrupalArticle>> => drupal.getAllArticles();

async function main() {
  const db = await database.newLocalDB(argv.db, argv.password);

  const drupal = new Drupal(db, false);
  const directus = new Directus(drupal);
  const categoryMap = await drupal.getDrupalCategoriesMap();
  const catQuery = Directus.createCategoriesImport(categoryMap);
  const deleteArticles = 'DELETE FROM articles;\n';
  const articles: Array<DrupalArticle> = await getDrupal(drupal);
  drupal.createMainBar(argv.articleCount ?? articles.length);
  const articleQueryArray = [];
  const articlesToGet = argv.articleCount ? articles.slice(0, argv.articleCount) : articles;
  articlesToGet.forEach((article) => {
    articleQueryArray.push(directus.createArticleValueSetQuery(article, categoryMap));
  });

  const articlesProcessed = await Promise.all(articleQueryArray);
  fs.writeFile(
    'import.sql',
    `${(await catQuery)
      + deleteArticles
      + Directus.insertArticleStart()
      + articlesProcessed.join(',')};`,
    (err) => {
      if (err) throw err;
    },
  );
  drupal.stopMultibar();
  await drupal.stopDB();
}

main();
