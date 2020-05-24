/* eslint-disable @typescript-eslint/camelcase */

import { IncomingMessage } from "http";

import slug from "slug";
import sharp, { Sharp } from "sharp";
import mysql2 from "mysql2";
import FormData from "form-data";
import Bluebird from "bluebird";
import { IFileResponse } from "@directus/sdk-js/dist/types/schemes/response/File";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

import * as utils from "./utils";
import progress from "./progress";
import logger from "./logger";
import DrupalArticle from "./drupal/article";

const MB = 1024 * 1024;

export interface CategoryMap {
  [name: string]: number;
}

// Directus main class
class Directus {
  // SDK handles concurrency issues, so we only want to use one instance
  private static sdk: SDK = new SDK({
    mode: "cookie" as AuthModes,
    url: "http://api.satirev.org/",
    project: "satire-v",
    token: "letmeinyoubitch",
  });

  public static insertArticleStart = `INSERT INTO articles (
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

  constructor() {}

  public static chunkArray<T>(array: Array<T>, size: number): Array<T[]> {
    const result: Array<T[]> = [];
    for (let i = 0; i < array.length; i += size) {
      const chunk: Array<T> = array.slice(i, i + size);
      result.push(chunk);
    }
    return result;
  }

  public static async getImageIds(): Promise<{ data: { id: number }[] }> {
    const res = await Directus.sdk.getFiles({ fields: "id", limit: -1 });
    return res as any;
    // Typing is wrong here
  }

  /* deletes all the images for a clean migration from drupal */
  public static async deleteImages(): Promise<void> {
    const { data: ids } = await Directus.getImageIds();
    if (ids.length === 0) return;
    const idArray = ids.map(item => item.id);
    const idChunks = Directus.chunkArray(idArray, 100);
    await Bluebird.all(
      idChunks.map(
        async idChunk =>
          await Directus.sdk.deleteItems("directus_files", idChunk)
      )
    );
  }

  public static async uploadImage(image: DrupalImage): Promise<void> {
    // let file: Sharp | Buffer | IncomingMessage = fileData;
    // if (fileMimeType === "image/gif") {
    //   if (fileData instanceof Buffer) {
    //     file = sharp(fileData).png();
    //   } else {
    //     const transformer = sharp().png();
    //     file = fileData.pipe(transformer);
    //   }
    //   logger.info(`Converting ${fileName} from gif to png`);
    //   fileMimeType = "image/png";
    //   fileName = fileName.replace(".gif", ".png");
    // } else if (
    //   fileData instanceof IncomingMessage &&
    //   fileData.headers["content-length"] &&
    //   parseInt(fileData.headers["content-length"], 10) > 5 * MB
    // ) {
    //   const transformer = sharp().resize(1000);
    //   file = fileData.pipe(transformer);
    //   logger.info(
    //     `Resizing ${fileName} from ${fileData.headers["content-length"]}`
    //   );
    // }
    // TODO: move to drupalimage
    const form = new FormData();
    form.append("filename_download", fileName);
    form.append("filename_disk", fileName);
    form.append("data", file, fileName);

    logger.debug(`Trying to upload ${fileName}`);

    const content: IFileResponse = await this.sdk.api
      .request("post", "/files", {}, form, false, { ...form.getHeaders() })
      .catch(e => {
        logger.warn(`Failed uploading ${fileName}`);
        logger.warn(e);
        throw e;
      })
      .then(res => {
        logger.debug(`Upload succeeeded for ${fileName}`);
        return res;
      });
    // TODO: Set new properties of DrupalImage instance here yay
    // return {
    //   fullUri: (content.data.data as { full_url: string }).full_url,
    //   imageID: content.data.id,
    // };
  }

  public static createCategoriesImport(categoryMap: CategoryMap): string {
    let query =
      "DELETE FROM categories;\nINSERT INTO categories (`name`,`slug`, id) VALUES";
    const queryArray: string[] = [];
    Object.keys(categoryMap).forEach(key => {
      queryArray.push(`('${key}', '${slug(key)}', ${categoryMap[key]})`);
    });
    query += `${queryArray.join(",")};\n`;
    return query;
  }

  /* The big one. Creates the SQL query to insert an article, all of the fields */
  public static async createArticleImportQuery(
    article: DrupalArticle
  ): Promise<string> {
    // Drupal stores it as binary 1/0
    const pub = article.status ? "published" : "draft";
    const created = utils.unixToSQLDate(article.created);
    const changed = utils.unixToSQLDate(article.changed);
    // Quotes mess up sql queries, so we use sql escape fn
    const title = mysql2.escape(article.title);
    const tags = mysql2.escape(article.tags_info);
    const caption = mysql2.escape(article.caption);
    const teaser = mysql2.escape(article.teaser);
    // let categoryID = Directus.categoryMap[article.category_name];
    // if (categoryID == null) {
    //   categoryID = Directus.categoryMap["Everything Else"];
    // }
    // TODO: move to article class
    const newSlug = slug(article.title, {
      lower: true,
    });
    // keep old slug for backwards compatibility
    const legacySlug = mysql2.escape(article.relative_path);
    const imageID: number | null = null;
    // if (article.image_uri != null) {
    //   const res = await articleProcessor.drupalToDirectusImage(
    //     article.image_uri,
    //     article.relative_path
    //   );
    //   if (res) imageID = res.imageID;
    // }
    // TODO:  move to article class
    // const body = mysql2.escape(
    //   await articleProcessor.genProcessHTMLInlineFileTags(article)
    // );
    const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
    // Done with this article's processing
    progress.incArticlesBar();
    return values;
  }
}

const directus = new Directus();

export default directus;
