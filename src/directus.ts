/* eslint-disable @typescript-eslint/camelcase */

import slug from "slug";
import mysql2 from "mysql2";
import FormData from "form-data";
import {
  // IFilesResponse,
  IFileResponse,
} from "@directus/sdk-js/dist/types/schemes/response/File";
// import { IFile } from "@directus/sdk-js/dist/types/schemes/directus/File";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

import { Drupal, DrupalArticle } from "./drupal";

export interface CategoryMap {
  [name: string]: number;
}

// Directus main class
class Directus {
  drupal: Drupal;
  sdk: SDK;

  constructor(drupal: Drupal) {
    this.drupal = drupal;
    this.sdk = new SDK({
      mode: "cookie" as AuthModes,
      url: "http://api.satirev.org/",
      project: "satire-v",
      token: "letmeinyoubitch",
    });
    this.drupal.setUploadFn(this.uploadImage.bind(this));
  }

  async getImageIds(): Promise<{ data: { id: number }[] }> {
    return (await this.sdk.getFiles({ fields: "id" })) as any;
    // Typing is wrong here
  }

  /* deletes all the images for a clean migration from drupal */
  async deleteImages(ids: Array<{ id: number }>): Promise<void> {
    return await this.sdk.deleteItems(
      "directus_files",
      ids.map(item => item.id)
    );
  }

  async uploadImage(
    fileData: Buffer | ReadableStream,
    fileName: string,
    fileMimeType: string
  ): Promise<{ fullUri: string; fileName: string; imageID: number }> {
    const form = new FormData();
    form.append("filename_download", fileName);
    form.append("filename_disk", fileName);
    form.append("data", fileData, fileName);

    this.drupal.fileDebugStream.write(`Trying to upload ${fileName}\n`);

    const content: IFileResponse = await this.sdk.api
      .request("post", "/files", {}, form, false, { ...form.getHeaders() })
      .catch(e => {
        throw new Error(`Failed uploading ${fileName}: ${e}`);
      });

    return {
      fullUri: (content.data.data as { full_url: string }).full_url,
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
