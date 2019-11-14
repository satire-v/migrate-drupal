// @flow
import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const request = require('request-promise-native');
const mysql2 = require('mysql2');
const slug = require('slug');

const drupal = require('./drupal');

async function uploadImage(
  imageBase64: string,
  fileName: string,
  type?: ?string,
): Promise<{ fullUri: string, imageID: number }> {
  const options: Obj = {
    method: 'POST',
    url: 'http://admin.satirev.org/_/files',
    project: '_', // default
    auth: {
      // static auth token
      bearer: 'letmeinyoubitch',
    },
    formData: {
      filename: fileName,
      data: imageBase64,
      contentType: type || '',
    },
    json: true,
  };
  const content = await request(options);
  // return url for sourcing
  // and id for database linking
  return { fullUri: content.data.data.full_url, imageID: content.data.id };
}

// TODO programmatic
function createCategoriesImport(categoryMap: Obj): string {
  let query = 'DELETE FROM categories;\nINSERT INTO categories (`name`, id) VALUES';
  Object.keys(categoryMap).forEach((key) => {
    query += `('${key}', ${categoryMap[key]})`;
  });
  query += ';';
  return query;
}

function unixToSQLDate(unixts: number) {
  return new Date(unixts * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

async function createArticleValueSetQuery(
  db: Obj,
  article: DrupalArticle,
  categoryMap: Obj,
): Promise<string> {
  const body = mysql2.escape(drupal.processHTMLInlineFileTags(db, article));
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
  const { imageID } = await drupal.drupalToDirectusImage(
    article.image_uri,
    article.relative_uri,
  );
  const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${await body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
  return values;
}

module.exports = { uploadImage, createCategoriesImport, createArticleValueSetQuery };
