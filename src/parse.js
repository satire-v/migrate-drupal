// @flow
import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const fs = require('fs');

const yargs = require('yargs');

const drupal = require('./drupal');
const database = require('./database');
const directus = require('./directus');

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
  .help()
  .alias('help', 'h')
  .demandOption(
    ['password'],
    'Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)',
  );

function getDrupal(db: Obj): Promise<Array<DrupalArticle>> {
  return drupal.getAllArticles(db);
}


async function main() {
  const db = await database.newLocalDB(argv.db, argv.password);
  const categoryMap = await drupal.getDrupalCategoriesMap(db);
  console.log(categoryMap);
  // const catQuery = directus.createCategoriesImport(categoryMap);
  // const deleteArticles = 'DELETE FROM articles;\n';
  // const insertStart = `INSERT INTO articles (
  //   \`status\`,
  //   created_by,
  //   modified_by,
  //   created_on,
  //   modified_on,
  //   title,
  //   body,
  //   tags,
  //   featured_image,
  //   featured_image_caption,
  //   excerpt,
  //   category,
  //   slug,
  //   legacy_slug
  // )
  // VALUES `;
  // const articles: Array<DrupalArticle> = await getDrupal(db);
  // const articleQueryArray = [];
  // articles.forEach((article) => {
  //   articleQueryArray.push(directus.createArticleValueSetQuery(db, article, categoryMap));
  // });
  // await Promise.all(articleQueryArray);
  // fs.writeFile(
  //   'import.sql',
  //   `${(await catQuery) + deleteArticles + insertStart + articleQueryArray.join(',')};`,
  //   (err) => {
  //     if (err) throw err;
  //   },
  // );
  await db.end();
}

main();
