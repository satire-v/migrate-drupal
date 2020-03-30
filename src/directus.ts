/* eslint-disable @typescript-eslint/camelcase */

import slug from "slug";
import needle, { NeedleOptions, ReadableStream } from "needle";
import mysql2 from "mysql2";

import { Drupal, DrupalArticle } from "./drupal";

export interface CategoryMap {
  [name: string]: number;
}

// Directus main class
class Directus {
  drupal: Drupal;

  constructor(drupal: Drupal) {
    this.drupal = drupal;
    this.drupal.setUploadFn(this.uploadImage.bind(this));
  }

  static async getImageIds(): Promise<{ data: { id: number }[] }> {
    const options: NeedleOptions = {
      headers: {
        Authorization: "Bearer letmeinyoubitch",
      },
      json: false,
      parse_response: "json",
    };
    return await needle(
      "get",
      "http://api.satirev.org/satire-v/files",
      { fields: "id" },
      options
    ).then(res => res.body);
  }

  /* deletes all the images for a clean migration from drupal */
  static async deleteImages(ids: Array<{ id: number }>): Promise<void> {
    const url = `http://api.satirev.org/satire-v/files/${ids
      .map(e => e.id)
      .join(",")}`;
    const options: NeedleOptions = {
      headers: {
        // static auth token
        Authorization: "Bearer letmeinyoubitch",
      },
      auth: "auto",
      parse_response: "json",
    };
    return await needle("delete", url, options).then(res => res.body);
  }

  async uploadImage(
    fileData: Buffer | ReadableStream,
    fileName: string,
    fileMimeType: string
  ): Promise<{ fullUri: string; fileName: string; imageID: number }> {
    const url = "http://api.satirev.org/satire-v/files";
    const body = {
      filename_disk: fileName,
      filename_download: fileName,
      data: {
        value: fileData,
        options: {
          filename: fileName,
          contentType: fileMimeType,
        },
      },
    };

    const options: NeedleOptions = {
      headers: {
        Authorization: "Bearer letmeinyoubitch",
      },
      timeout: this.drupal.fileTimeout,
      multipart: true,
      auth: "auto",
    };

    this.drupal.fileDebugStream.write(`Trying to upload ${fileName}\n`);

    const content = await needle("post", url, body, options)
      .catch(err => {
        throw new Error(`Failed uploading ${fileName}: ${err}`);
      })
      .then(res => {
        this.drupal.fileDebugStream.write(
          `Succeeded in uploading ${fileName}\n`
        );
        return res.body;
      });

    return {
      fullUri: content.data.data.full_url,
      fileName,
      imageID: content.data.id,
    };
  }

  static createCategoriesImport(categoryMap: CategoryMap): string {
    let query =
      "DELETE FROM categories;\nINSERT INTO categories (`name`,`slug`, id) VALUES";
    const queryArray: string[] = [];
    Object.keys(categoryMap).forEach(key => {
      queryArray.push(`('${key}', '${slug(key)}', ${categoryMap[key]})`);
    });
    query += `${queryArray.join(",")};\n`;
    return query;
  }

  // SQL dates are formatted slightly differently than unix
  static unixToSQLDate(unixts: number): string {
    return new Date(unixts * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  }

  static insertArticleStart(): string {
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
    categoryMap: CategoryMap
  ): Promise<string> {
    const drupalArticleProcessor = this.drupal.newArticleProcessor();
    // Drupal stores it as binary 1/0
    const pub = article.status ? "published" : "draft";
    const created = Directus.unixToSQLDate(article.created);
    const changed = Directus.unixToSQLDate(article.changed);
    // Quotes mess up sql queries, so we use sql escape fn
    const title = mysql2.escape(article.title);
    const tags = mysql2.escape(article.tags_info);
    const caption = mysql2.escape(article.caption);
    const teaser = mysql2.escape(article.teaser);
    let categoryID = categoryMap[article.category_name];
    if (categoryID == null) {
      categoryID = categoryMap["Everything Else"];
    }
    const newSlug = slug(article.title, {
      lower: true,
    });
    // keep old slug for backwards compatibility
    const legacySlug = mysql2.escape(article.relative_uri);
    let imageID: number | null = null;
    if (article.image_uri != null) {
      const res = await drupalArticleProcessor.drupalToDirectusImage(
        article.image_uri,
        article.relative_uri
      );
      imageID = res.imageID;
    }
    const body = mysql2.escape(
      await drupalArticleProcessor.genProcessHTMLInlineFileTags(article)
    );
    const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
    // Done with this article's processing
    this.drupal.incrementArticleBar();
    return values;
  }
}

export default Directus;
