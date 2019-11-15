



const fs = require('fs');

const yargs = require('yargs');

const database = require('./database');
const directus = require('./directus');
const drupal = require('./drupal');

const { argv } = yargs.
option('db', {
  alias: 'd',
  description: 'The local database to query from',
  type: 'string',
  default: 'satirevdrupal' }).

option('password', {
  alias: 'p',
  description: 'The password to the local database',
  type: 'string' }).

help().
alias('help', 'h').
demandOption(
['password'],
'Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)');


const getDrupal = db => drupal.getAllArticles(db);


const main = async () => {
  const db = await database.newLocalDB(argv.db, argv.password);
  const categoryMap = await drupal.getDrupalCategoriesMap(db);
  const catQuery = directus.createCategoriesImport(categoryMap);
  const deleteArticles = 'DELETE FROM articles;\n';
  const articles = await getDrupal(db);
  const articleQueryArray = [];
  articles.forEach(article => {
    articleQueryArray.push(directus.createArticleValueSetQuery(db, article, categoryMap));
  });
  await Promise.all(articleQueryArray);
  fs.writeFile(
  'import.sql',
  `${(await catQuery) + deleteArticles + directus.insertArticleStart + articleQueryArray.join(',')};`,
  err => {
    if (err) throw err;
  });

  await db.end();
};

main();
//# sourceMappingURL=parse.js.map