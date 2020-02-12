// @flow

import type { DrupalArticle } from './drupal';
import type { Obj } from './utils';

const mysql2 = require('mysql2');
// slugifying library. same as Directus, I believe
const slug = require('slug');
// yes, i'm using both
const requestPromise = require('request-promise-native');
const request = require('request');

const Drupal = require('./drupal');

// See below function, but just flow typing for a map of category name to category id
export type CategoryMap = { [string]: number };

// Directus main class
class Directus {
  drupal: Drupal;

  constructor(drupal: Drupal) {
    this.drupal = drupal; // instance of a drupal object/module/class
    /* uploadImage lives here because it has to do solely with directus,
    but the Drupal object needs to be able to call the function from itself
    so that the async/progress bar setup works  */
    this.drupal.setUploadFn(this.uploadImage.bind(this));
  }

  /* This just fetches the ID of every single image in directus,
  so we can delete them all in one go. Should be a better way to do this, but for security
  Directus doesn't allow batch delete, a reasonable precaution */
  static async getImageIds(): Promise<any> {
    const options: Obj = {
      method: 'get',
      // hardcoded url
      url: 'http://api.satirev.org/satire-v/files',
      project: 'satire-v',
      auth: {
        // static auth token
        bearer: 'letmeinyoubitch',
      },
      qs: {
        fields: 'id',
      },
    };
    return JSON.parse(await requestPromise.get(options));
  }

  /* deletes all the images for a clean migration from drupal */
  static async deleteImages(ids: Array<{ id: number }>): Promise<any> {
    const options: Obj = {
      method: 'delete',
      url: `http://api.satirev.org/satire-v/files/${ids.map((e) => e.id).join(',')}`,
      project: 'satire-v',
      auth: {
        // static auth token
        bearer: 'letmeinyoubitch',
      },
    };
    return requestPromise.delete(options);
  }

  /* A fairly dumb function in that it just gets the data and uploads it.
  The parsing is done elsewhere */
  async uploadImage(
    /* request.Request is essentially a readble stream with some extra features,
    and both that and buffer work just fine with the api */
    fileData: Buffer | request.Request,
    fileName: string,
    fileMimeType: string,
  ): Promise<{ fullUri: string, fileName: string, imageID: number }> {
    const options: Obj = {
      method: 'post',
      // hardcoded url
      url: 'http://api.satirev.org/satire-v/files',
      project: 'satire-v',
      auth: {
        // static auth token
        bearer: 'letmeinyoubitch',
      },
      timeout: this.drupal.fileTimeout,
      time: true,
      // Formdata format is the most reliable way to have the request processed correctly
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

    /* Logging, or trying to. Should probably use an actual debugging library,
    but this was sort of paperclips and gum while I needed some info easily  */
    this.drupal.fileDebugStream.write(`Trying to upload ${fileName}\n`);

    /* We await this one because we can't do anything more until we have the
    id of the uploaded file */
    const content = await requestPromise
      .post(options)
      .catch((err) => {
        /* When this catch fires, I think, there isn't "Formdata: ..." in the err message
        When that shoes up, I believe it's thrown from the download function */
        throw new Error(`Failed uploading ${fileName}: ${err}`);
      })
      .then((res) => {
        this.drupal.fileDebugStream.write(`Succeeded in uploading ${fileName}\n`);
        return JSON.parse(res);
      });

    // Return the url for img tags
    // Return id for database linking (featured image)
    // Return name for convenience and safety (sometimes there are namespace conflicts)
    return {
      fullUri: content.data.data.full_url,
      fileName,
      imageID: content.data.id,
    };
  }

  /* Fetches categories from Drupal database copy,
  and creates SQL query to insert them in Directus */
  static createCategoriesImport(categoryMap: CategoryMap): string {
    // Start with a clean slate
    let query = 'DELETE FROM categories;\nINSERT INTO categories (`name`,`slug`, id) VALUES';
    const queryArray = [];
    // SQL value entries are surrounded by parentheses, separated by commas
    Object.keys(categoryMap).forEach((key) => {
      queryArray.push(`('${key}', '${slug(key)}', ${categoryMap[key]})`);
    });
    query += `${queryArray.join(',')};\n`;
    return query;
  }

  // SQL dates are formatted slightly differently than unix
  static unixToSQLDate(unixts: number) {
    return new Date(unixts * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
  }

  /* Just the beginning of the query. I wish there was some way to type check this
  field order but for now I just try to locate it close by */
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

  /* The big one. Creates the SQL query to insert an article, all of the fields */
  async createArticleImportQuery(
    article: DrupalArticle,
    categoryMap: CategoryMap,
  ): Promise<string> {
    /* See drupal for explanation of this. Basically each article should run its own async process,
    because they don't rely on each other for anything */
    const drupalArticleProcessor = this.drupal.newArticleProcessor();
    // Drupal stores it as binary 1/0
    const pub = article.status ? 'published' : 'draft';
    const created = Directus.unixToSQLDate(article.created);
    const changed = Directus.unixToSQLDate(article.changed);
    // Quotes mess up sql queries, so we use sql escape fn
    const title = mysql2.escape(article.title);
    const tags = mysql2.escape(article.tags_info);
    const caption = mysql2.escape(article.caption);
    const teaser = mysql2.escape(article.teaser);
    let categoryID = categoryMap[article.category_name];
    // I got rid of these manually on the Drupal site, but just in case
    if (categoryID == null) {
      categoryID = categoryMap['Everything Else'];
    }
    // Strip out random quotes and special characters to create a new, clean slug
    const newSlug = slug(article.title, {
      lower: true,
    });
    // But keep old slug for backwards compatibility
    const legacySlug = mysql2.escape(article.relative_uri);
    // Download featured img from Drupal, upload to Directus. Get ID back to link to in field
    const { imageID } = await drupalArticleProcessor.drupalToDirectusImage(
      article.image_uri,
      article.relative_uri,
    );
    // Drupal processes all the html and image bullshit, then mysql escapes it
    const body = mysql2.escape(await drupalArticleProcessor.genProcessHTMLInlineFileTags(article));
    // Big long import statement. Important to use the same order as in the statement above
    const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
    // Done with this article's processing
    this.drupal.incrementArticleBar();
    return values;
  }
}

module.exports = Directus;
