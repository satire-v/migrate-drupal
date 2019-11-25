// @flow
import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const mysql2 = require('mysql2');
const slug = require('slug');

const drupal = require('./drupal');

const createCategoriesImport = (categoryMap: Obj): string => {
  let query = 'DELETE FROM categories;\nINSERT INTO categories (`name`, id) VALUES';
  const queryArray = [];
  Object.keys(categoryMap).forEach((key) => {
    queryArray.push(`('${key}', ${categoryMap[key]})`);
  });
  query += `${queryArray.join(',')};\n`;
  return query;
};

const unixToSQLDate = (unixts: number) => new Date(unixts * 1000)
  .toISOString()
  .slice(0, 19)
  .replace('T', ' ');

const insertArticleStart = `INSERT INTO articles (
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

const createArticleValueSetQuery = async (
  db: Obj,
  article: DrupalArticle,
  categoryMap: Obj,
  bar: Obj,
): Promise<string> => {
  const pub = article.status ? 'published' : 'draft';
  const created = unixToSQLDate(article.created);
  const changed = unixToSQLDate(article.changed);
  const title = mysql2.escape(article.title);
  const tags = mysql2.escape(article.tags_info);
  const caption = mysql2.escape(article.caption);
  const teaser = mysql2.escape(article.teaser);
  const categoryID = categoryMap[article.category_name];
  const newSlug = slug(article.title, {
    lower: true,
  });
  const legacySlug = mysql2.escape(article.relative_uri);
  const { imageID } = await drupal.drupalToDirectusImage(article.image_uri, article.relative_uri);
  const body = mysql2.escape(await drupal.processHTMLInlineFileTags(db, article));
  const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
  bar.increment();
  return values;
};

module.exports = {
  createCategoriesImport,
  createArticleValueSetQuery,
  insertArticleStart,
};
