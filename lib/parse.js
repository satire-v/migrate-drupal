


const fs = require('fs');

const yargs = require('yargs');

const database = require('./database');
const Directus = require('./directus');
const Drupal = require('./drupal');

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

option('articleCount', {
  alias: 'n',
  description: 'Number of articles to write to import',
  type: 'number',
  default: null }).

help().
alias('help', 'h').
demandOption(
['password'],
'Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)');


const getDrupal = drupal => drupal.genAllArticles();

async function main() {var _argv$articleCount;
  const db = await database.newLocalDB(argv.db, argv.password);

  const drupal = new Drupal(db, true);
  const directus = new Directus(drupal);
  const categoryMap = await drupal.genDrupalCategoriesMap();
  const catQuery = Directus.createCategoriesImport(categoryMap);
  const deleteArticles = 'DELETE FROM articles;\n';
  const articles = await getDrupal(drupal);
  drupal.createArticleProgressBar((_argv$articleCount = argv.articleCount) !== null && _argv$articleCount !== void 0 ? _argv$articleCount : articles.length);
  const articleQueryArray = [];
  const articlesToGet = argv.articleCount ? articles.slice(0, argv.articleCount) : articles;
  articlesToGet.forEach(article => {
    articleQueryArray.push(directus.createArticleImportQuery(article, categoryMap));
  });

  const articlesProcessed = await Promise.all(articleQueryArray);
  fs.writeFile(
  'import.sql',
  `${(await catQuery) +
  deleteArticles +
  Directus.insertArticleStart() +
  articlesProcessed.join(',')};`,
  err => {
    if (err) throw err;
  });

  drupal.stopMultibar();
  await drupal.stopDB();
}

main();
//# sourceMappingURL=parse.js.map