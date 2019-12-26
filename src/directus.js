// @flow

import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const mysql2 = require('mysql2');
const slug = require('slug');
const requestPromise = require('request-promise-native');
const request = require('request');

const Drupal = require('./drupal');

class Directus {
  drupal: Drupal;

  constructor(drupal: Drupal) {
    this.drupal = drupal; // instance of a drupal object/module
    this.drupal.setUploadFn(Directus.uploadImage);
  }

  static async uploadImage(
    fileData: Buffer | request.Request,
    fileName: string,
    fileMimeType: string,
  ): Promise<{ fullUri: string, imageID: number }> {
    const options: Obj = {
      url: 'http://api.satirev.org/satire-v/files',
      project: 'satire-v',
      auth: {
        // static auth token
        bearer: 'letmeinyoubitch',
      },
      formData: {
        filename_disk: fileName,
        filename_download: fileName,
        data: {
          value: fileData,
          options: {
            filename: fileName,
            contentType: fileMimeType,
          },
        },
      },
    };
    let content = await requestPromise.post(options);
    content = JSON.parse(content);

    // return url for sourcing
    // and id for database linking
    return {
      fullUri: content.data.data.full_url,
      imageID: content.data.id,
    };
  }

  static createCategoriesImport(categoryMap: Obj): string {
    let query = 'DELETE FROM categories;\nINSERT INTO categories (`name`,`slug`, id) VALUES';
    const queryArray = [];
    Object.keys(categoryMap).forEach((key) => {
      queryArray.push(`('${key}', '${slug(key)}', ${categoryMap[key]})`);
    });
    query += `${queryArray.join(',')};\n`;
    return query;
  }

  static unixToSQLDate(unixts: number) {
    return new Date(unixts * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
  }

  static insertArticleStart() {
    return `INSERT INTO articles (
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
  }

  async createArticleImportQuery(article: DrupalArticle, categoryMap: Obj): Promise<string> {
    const drupalArticleProcessor = this.drupal.newArticleProcessor();
    const pub = article.status ? 'published' : 'draft';
    const created = Directus.unixToSQLDate(article.created);
    const changed = Directus.unixToSQLDate(article.changed);
    const title = mysql2.escape(article.title);
    const tags = mysql2.escape(article.tags_info);
    const caption = mysql2.escape(article.caption);
    const teaser = mysql2.escape(article.teaser);
    const categoryID = categoryMap[article.category_name];
    const newSlug = slug(article.title, {
      lower: true,
    });
    const legacySlug = mysql2.escape(article.relative_uri);
    const { imageID } = await drupalArticleProcessor.drupalToDirectusImage(
      article.image_uri,
      article.relative_uri,
    );
    const body = mysql2.escape(await drupalArticleProcessor.processHTMLInlineFileTags(article));
    const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
    this.drupal.incrementArticleBar();
    return values;
  }
}

module.exports = Directus;
