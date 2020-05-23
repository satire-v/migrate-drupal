/* eslint-disable @typescript-eslint/camelcase */

import { IncomingMessage } from "http";

import winston, { Logger } from "winston";
import slug from "slug";
import sharp, { Sharp } from "sharp";
import FormData from "form-data";
import Bluebird from "bluebird";
import { IFileResponse } from "@directus/sdk-js/dist/types/schemes/response/File";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

import logger from "../logger";
import { Drupal, DrupalArticle } from "../drupal";

const MB = 1024 * 1024;

export interface CategoryMap {
  [name: string]: number;
}

// Directus main class
class Directus {
  private sdk: SDK;

  constructor() {
    this.sdk = new SDK({
      mode: "cookie" as AuthModes,
      url: "http://api.satirev.org/",
      project: "satire-v",
      token: "letmeinyoubitch",
    });
  }

  async getImageIds(): Promise<{ data: { id: number }[] }> {
    const res = await this.sdk.getFiles({ fields: "id", limit: -1 });
    return res as any;
    // Typing is wrong here
  }

  static chunkArray<T>(array: Array<T>, size: number): Array<T[]> {
    const result: Array<T[]> = [];
    for (let i = 0; i < array.length; i += size) {
      const chunk: Array<T> = array.slice(i, i + size);
      result.push(chunk);
    }
    return result;
  }

  /* deletes all the images for a clean migration from drupal */
  async deleteImages(ids: Array<{ id: number }>): Promise<void> {
    const idArray = ids.map(item => item.id);
    const idChunks = Directus.chunkArray(idArray, 100);
    await Bluebird.all(
      idChunks.map(
        async idChunk => await this.sdk.deleteItems("directus_files", idChunk)
      )
    );
  }

  async uploadImage(
    fileData: Buffer | IncomingMessage,
    fileName: string,
    fileMimeType: string
  ): Promise<{ fullUri: string; fileName: string; imageID: number }> {
    let file: Sharp | Buffer | IncomingMessage = fileData;
    if (fileMimeType === "image/gif") {
      if (fileData instanceof Buffer) {
        file = sharp(fileData).png();
      } else {
        const transformer = sharp().png();
        file = fileData.pipe(transformer);
      }
      logger.info(`Converting ${fileName} from gif to png`);
      fileMimeType = "image/png";
      fileName = fileName.replace(".gif", ".png");
    } else if (
      fileData instanceof IncomingMessage &&
      fileData.headers["content-length"] &&
      parseInt(fileData.headers["content-length"], 10) > 5 * MB
    ) {
      const transformer = sharp().resize(1000);
      file = fileData.pipe(transformer);
      logger.info(
        `Resizing ${fileName} from ${fileData.headers["content-length"]}`
      );
    }
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
    // const drupalArticleProcessor = this.drupal.newArticleProcessor(
    //   article.title,
    //   article.nid
    // );
    // // Drupal stores it as binary 1/0
    // const pub = article.status ? "published" : "draft";
    // const created = Directus.unixToSQLDate(article.created);
    // const changed = Directus.unixToSQLDate(article.changed);
    // // Quotes mess up sql queries, so we use sql escape fn
    // const title = mysql2.escape(article.title);
    // const tags = mysql2.escape(article.tags_info);
    // const caption = mysql2.escape(article.caption);
    // const teaser = mysql2.escape(article.teaser);
    // let categoryID = categoryMap[article.category_name];
    // if (categoryID == null) {
    //   categoryID = categoryMap["Everything Else"];
    // }
    // const newSlug = slug(article.title, {
    //   lower: true,
    // });
    // // keep old slug for backwards compatibility
    // const legacySlug = mysql2.escape(article.relative_path);
    // let imageID: number | null = null;
    // if (article.image_uri != null) {
    //   const res = await drupalArticleProcessor.drupalToDirectusImage(
    //     article.image_uri,
    //     article.relative_path
    //   );
    //   if (res) imageID = res.imageID;
    // }
    // const body = mysql2.escape(
    //   await drupalArticleProcessor.genProcessHTMLInlineFileTags(article)
    // );
    // const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${imageID}, ${caption}, ${teaser}, ${categoryID}, '${newSlug}', ${legacySlug})`;
    // // Done with this article's processing
    // // this.drupal.incrementArticleBar();
    // return values;
    return "";
  }
}

export default Directus;
