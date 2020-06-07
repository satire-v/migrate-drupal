/* eslint-disable @typescript-eslint/camelcase */

import slug from "slug";
import mysql2 from "mysql2";
import FormData from "form-data";
import retry from "bluebird-retry";
import Bluebird from "bluebird";
import { IFileResponse } from "@directus/sdk-js/dist/types/schemes/response/File";
import { AuthModes } from "@directus/sdk-js/dist/types/Authentication";
import SDK from "@directus/sdk-js";

import * as utils from "../utils";
import progress from "../progress";
import logger from "../logger";

import { DrupalImage } from "./drupal/image";
import type { Article, CategoryMap } from "./drupal/article";

export const sdk = new SDK({
  mode: "cookie" as AuthModes,
  url: "http://api.satirev.org/",
  project: "satire-v",
  token: "letmeinyoubitch",
});

// Directus main class
class Directus {
  // SDK handles concurrency issues, so we only want to use one instance
  private sdk: SDK = sdk;

  constructor() {}

  public categoriesImport(categoryMap: CategoryMap): string {
    let query =
      "DELETE FROM categories;\nINSERT INTO categories (`name`,`slug`, id) VALUES";
    const queryArray: string[] = [];
    Object.keys(categoryMap).forEach(key => {
      queryArray.push(`('${key}', '${slug(key)}', ${categoryMap[key]})`);
    });
    query += `${queryArray.join(",")};\n`;
    return query;
  }

  public insertArticleStart = `INSERT INTO articles (
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

  private chunkArray<T>(array: Array<T>, size: number): Array<T[]> {
    const result: Array<T[]> = [];
    for (let i = 0; i < array.length; i += size) {
      const chunk: Array<T> = array.slice(i, i + size);
      result.push(chunk);
    }
    return result;
  }

  private async getImageIds(): Promise<{ data: { id: number }[] }> {
    const res = await this.sdk.getFiles({ fields: "id", limit: -1 });
    return res as any;
    // Typing is wrong here
  }

  /* deletes all the images for a clean migration from drupal */
  public async deleteImages(): Promise<void> {
    const { data: ids } = await this.getImageIds();
    if (ids.length === 0) return;
    const idArray = ids.map(item => item.id);
    const idChunks = this.chunkArray(idArray, 100);
    await Bluebird.all(
      idChunks.map(
        async idChunk => await this.sdk.deleteItems("directus_files", idChunk)
      )
    );
    logger.info("Deleted existing images");
  }

  public async uploadImage<T extends DrupalImage>(
    image: T
  ): Promise<{ directusUri: string; imageID: number }> {
    const res = await retry<{
      directusUri: string;
      imageID: number;
    }>(
      async () => {
        const data = await image.data; // Download part
        if (!data) {
          return null;
        }
        const fileName = await image.fileName;
        const form = new FormData();
        form.append("filename_download", fileName);
        form.append("filename_disk", fileName);
        form.append("data", data, fileName);

        logger.debug(`Trying to upload ${image.logName}`);

        const content: IFileResponse = await this.sdk.api
          .request("post", "/files", {}, form, false, { ...form.getHeaders() })
          .catch(e => {
            logger.warn(`Failed an upload attempt ${image.logName}; Retrying`);
            logger.warn(e);
            throw e;
          })
          .then(res => {
            logger.debug(`Upload succeeeded for ${image.logName}`);
            return res;
          });
        return {
          directusUri: (content.data.data as { full_url: string }).full_url,
          imageID: content.data.id,
        };
      },
      { throw_original: true }
    ).catch(err => {
      logger.error(`Coundn't transfer file ${image.logName}`);
      logger.error(err);
      throw err;
    });

    const index = DrupalImage.filesLeft.indexOf(image.logName);
    if (index > -1) {
      DrupalImage.filesLeft.splice(index, 1);
    }
    progress.incFilesBar();
    return res;
  }

  /* The big one. Creates the SQL query to insert an article, all of the fields */
  public async createArticleImportQuery(
    article: Article
  ): Promise<string> {
    // Drupal stores as binary 1/0
    const pub = article.status ? "published" : "draft";
    const created = utils.unixToSQLDate(article.created);
    const changed = utils.unixToSQLDate(article.changed);
    // Quotes mess up sql queries, so we use sql escape fn
    const title = mysql2.escape(article.title);
    const tags = mysql2.escape(article.tags_info);
    const caption = mysql2.escape(article.caption);
    const teaser = mysql2.escape(article.teaser);

    const newSlug = slug(article.title, {
      lower: true,
    });
    // keep old slug for backwards compatibility
    const legacySlug = mysql2.escape(article.relative_path);
    const body = mysql2.escape(await article.body);

    const values = `('${pub}', 1, 1, '${created}', '${changed}', ${title}, ${body}, ${tags}, ${await article.image_id}, ${caption}, ${teaser}, ${await article.category_id}, '${newSlug}', ${legacySlug})`;
    // Done with this article's processing
    progress.incArticlesBar();
    return values;
  }
}

const directus = new Directus();

export default directus;
