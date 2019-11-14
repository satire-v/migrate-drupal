// @flow
import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const fs = require('fs');

const mysql2 = require('mysql2/promise');
const slug = require('slug');
const yargs = require('yargs');

const queries = require('./queries');
const drupal = require('./drupal');
const database = require('./database');

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

function fetchDrupal(db: Obj): Promise<Array<DrupalArticle>> {
  return drupal.fetchFullDatabase(db);
}

async function createArticleQuery(
  article: DrupalArticle,
  categoryMap: Obj,
  db: Obj,
): Promise<string> {
  const body = await drupal.processHTMLInlineFileTags(article, db);
  const pub = article.status ? 'published' : 'draft';
  const { imageID } = await drupal.drupalToDirectusImage(
    article.image_uri,
    article.relative_uri,
  );
  const tags = article.tags_info;
  const values = `(
    '${pub}', 1, 1, '${new Date(article.created * 1000)
  .toISOString()
  .slice(0, 19)
  .replace('T', ' ')}', '${new Date(article.changed * 1000)
  .toISOString()
  .slice(0, 19)
  .replace('T', ' ')}', ${mysql2.escape(article.title)}, ${mysql2.escape(
  body,
)}, ${mysql2.escape(tags)}, ${imageID}, ${mysql2.escape(
  article.caption,
)}, ${mysql2.escape(article.teaser)}, ${
  categoryMap[article.category_name]
}, '${slug(article.title, {
  lower: true,
})}', ${mysql2.escape(article.relative_uri)}
)`;
  return values;
}

// TODO Fix names
async function main() {
  const db = await database.newLocalDB(argv.db, argv.password);
  const articles: Array<DrupalArticle> = await fetchDrupal(db);
  const categories = Object({
    Harvard: 1,
    Region: 2,
    'U.S.': 3,
    World: 4,
    Opinion: 5,
    'Everything Else': 6,
  });
  const catQuery = queries.createCategories(categories);
  const deleteArticles = 'DELETE FROM articles;\n';
  const insertStart = `INSERT INTO articles (
    \`status\`,
    created_by,
    modified_by,
    created_on,
    modified_on,
    title,
    body,
    tags,
    featured_image,
    featured_image_caption,
    excerpt,
    category,
    slug,
    legacy_slug
  )
  VALUES `;
  const articleQueryArray = [];
  articles.forEach(async (article) => {
    articleQueryArray.push(await createArticleQuery(article, categories, db));
  });
  fs.writeFile(
    'import.sql',
    `${catQuery + deleteArticles + insertStart + articleQueryArray.join(',')};`,
    (err) => {
      if (err) throw err;
    },
  );
  await db.end();
}

main();
