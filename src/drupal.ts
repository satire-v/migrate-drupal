/* eslint-disable @typescript-eslint/camelcase */
import { IncomingMessage } from "http";
import { Buffer } from "buffer";

import winston, { Logger } from "winston";
import { Connection, RowDataPacket, FieldPacket } from "mysql2/promise";
import cliProgress, { MultiBar, SingleBar } from "cli-progress";
import cheerio from "cheerio";
import retry from "bluebird-retry";
import Bluebird from "bluebird";
import axios, { AxiosRequestConfig } from "axios";

import utils from "./utils";
import { CategoryMap } from "./directus";

export interface DrupalArticle {
  nid: number;
  title: string;
  created: number;
  changed: number;
  status: 0 | 1;
  body: string;
  caption: string;
  category_id: number;
  category_name: string;
  teaser: string;
  year: number;
  image_id: number | null;
  image_uri: string | null;
  relative_uri: string;
  tags_info: string;
}

export type UploadFileFn = (
  fileData: Buffer | IncomingMessage,
  fileName: string,
  fileMimeType: string
) => Promise<UploadFileFnReturnType>;

export type UploadFileFnReturnType = { fullUri: string; imageID: number };

export class Drupal {
  multibar: MultiBar | null;
  db: Connection;
  articleProgressBar: SingleBar | null;
  filesProgressBar: SingleBar | null;
  filesTotal: number;
  uploadFileFn: UploadFileFn | null;
  logger: Logger;
  files: string[];
  filesLeft: string[];
  fileTimeout: number;

  constructor(db: Connection) {
    this.multibar = new cliProgress.MultiBar({
      format: "{value}/{total} | {percentage}% | {bar} | {message}",
      clearOnComplete: false,
      stream: process.stderr,
      noTTYOutput: false,
      notTTYSchedule: 0,
      forceRedraw: false,
      hideCursor: true,
    });
    this.db = db;
    this.filesTotal = 0;
    this.logger = winston.loggers.get("logger");
    this.files = [];
    this.filesLeft = [];
    this.fileTimeout = 15000;
    this.articleProgressBar = null;
    this.filesProgressBar = null;
    this.uploadFileFn = null;
  }

  newArticleProcessor(title: string, nid: number): DrupalArticleProcessor {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return new DrupalArticleProcessor(this, title, nid);
  }

  setUploadFn(fn: UploadFileFn): void {
    this.uploadFileFn = fn;
  }

  /*
   * Progress bar methods
   */

  createArticleProgressBar(total: number): void {
    this.articleProgressBar =
      this.multibar &&
      this.multibar.create(total, 0, {
        message: "Articles",
      });
  }

  async stopDB(): Promise<void> {
    await this.db.end();
  }

  stopMultibar(): void | null {
    return this.multibar && this.multibar.stop();
  }

  createFilesProgressBar(): void {
    this.filesProgressBar =
      this.multibar &&
      this.multibar.create(this.filesTotal, 0, {
        message: "Files",
      });
  }

  increaseFilesBarTotal(): void | null {
    this.filesTotal += 1;
    return (
      this.filesProgressBar && this.filesProgressBar.setTotal(this.filesTotal)
    );
  }

  incrementFilesBar(delta: number): void | null {
    return this.filesProgressBar && this.filesProgressBar.increment(delta);
  }

  incrementArticleBar(): void | null {
    return this.articleProgressBar && this.articleProgressBar.increment();
  }

  /*
   * Query construction methods
   */

  static getDrupalArticlesQuery(): string {
    return `SELECT
        n.nid,
        n.title,
        n.created,
        n.changed,
        n.status AS status,
        b.body_value AS body,
        c.field_caption_value AS caption,
        cat.field_category_tid AS category_id,
        tax.name AS category_name,
        t.field_teaser_value AS teaser,
        y.field_year_value AS year,
        image.field_image_fid as image_id,
        files.uri as image_uri,
        urls.alias as relative_uri,
        GROUP_CONCAT 
        (DISTINCT CONCAT(tags_tax.name) SEPARATOR ',') 
        AS tags_info
      FROM
        node n
        LEFT JOIN field_data_body b ON b.entity_id = n.nid
        LEFT JOIN field_data_field_caption c ON c.entity_id = n.nid
        LEFT JOIN field_data_field_category cat ON cat.entity_id = n.nid
        LEFT JOIN taxonomy_term_data tax ON tax.tid = cat.field_category_tid
        LEFT JOIN field_data_field_teaser t ON t.entity_id = n.nid
        LEFT JOIN field_data_field_year y ON y.entity_id = n.nid
        LEFT JOIN field_data_field_tags tags ON tags.entity_id = n.nid
        LEFT JOIN taxonomy_term_data tags_tax ON tags_tax.tid = tags.field_tags_tid
        LEFT JOIN field_data_field_image image ON image.entity_id = n.nid
        LEFT JOIN file_managed files ON files.fid = image.field_image_fid
        LEFT JOIN url_alias urls ON CAST(REGEXP_REPLACE(urls.source, '[^0-9]', '') AS UNSIGNED) = n.nid
      WHERE n.type = 'article' AND urls.source LIKE 'node%'
      GROUP BY n.nid,
        n.title,
        n.created,
        n.changed,
        status,
        body,
        caption,
        category_id,
        category_name,
        teaser,
        year,
        image_id,
        image_uri,
        relative_uri
      ORDER BY n.created DESC`;
  }

  static getDrupalCategoriesQuery(): string {
    return "SELECT term.name, term.tid FROM taxonomy_term_data term INNER JOIN taxonomy_vocabulary vocab ON term.vid = vocab.vid WHERE vocab.machine_name = 'categories'";
  }

  /*
   * Database get methods
   */

  async genAllArticles(): Promise<DrupalArticle[]> {
    const res: [RowDataPacket[], FieldPacket[]] = await this.db.query(
      Drupal.getDrupalArticlesQuery()
    );
    const nodes = res[0];
    const articles = JSON.parse(
      JSON.stringify(
        nodes.map(article => {
          if (article.body == null) article.body = "";
          return article;
        })
      )
    );
    return articles;
  }

  /**
   * @method @async
   * Maps category names to category ids from the drupal database
   */
  async genDrupalCategoriesMap(): Promise<CategoryMap> {
    interface CategoryEntry extends RowDataPacket {
      name: string;
      tid: number;
    }
    const res: [CategoryEntry[], FieldPacket[]] = await this.db.query(
      Drupal.getDrupalCategoriesQuery()
    );
    const entries = res[0];
    const categories = {} as { [name: string]: number };
    entries.forEach(entry => {
      categories[entry.name] = entry.tid;
    });
    return categories;
  }

  /*
   * Parsing util functions
   */

  static parseManagedImageInfo(
    localUri: string
  ): { fullUris: Array<string>; fileNameExisting: string } {
    return {
      fullUris: [
        localUri.replace(
          "public://",
          "https://satirev.org/sites/default/files/styles/original_cropped/public/"
        ),
        localUri.replace(
          "public://",
          "https://satirev.org/sites/default/files/"
        ),
      ],
      fileNameExisting: utils.getFileNameFromUri(localUri),
    };
  }

  findFID(obj: object): number | null {
    if (obj === null || typeof obj !== "object") return null;
    let res: null | number = null;
    Object.keys(obj).forEach(key => {
      if (key === "fid") res = obj[key];
      else res = res || this.findFID(obj[key]);
    });
    return res;
  }
}

export class DrupalArticleProcessor {
  drupal: Drupal;
  title: string;
  nid: number;

  i: number;

  constructor(drupal: Drupal, title: string, nid: number) {
    this.drupal = drupal;
    this.title = title;
    this.nid = nid;
    this.i = 0;
  }

  /*
   * File/image download/upload functions
   */

  async downloadImage(
    uris: Array<string>
  ): Promise<{
    reqStream: IncomingMessage;
    fileNameExt: string;
    imgType: string;
  } | null> {
    if (uris.length === 0) {
      throw new Error("No uris given for image");
    }

    const options: AxiosRequestConfig = {
      responseType: "stream",
      timeout: this.drupal.fileTimeout,
    };

    const fullUri: string | null = await utils
      .genFirstValidUri(uris)
      .catch(err => {
        this.drupal.logger.warn(`No valid uri for ${uris}`);
        this.drupal.logger.warn(err);
        throw err;
      });
    if (!fullUri) {
      return null;
    }
    const { fileNameExt, ext } = await utils
      .genFileNameExtfromUri(fullUri)
      .catch(err => {
        this.drupal.logger.warn(`Dumbass gave an invalid url ${fullUri}`);
        this.drupal.logger.warn(err);
        throw err;
      });

    this.drupal.logger.debug(`Trying to download ${fileNameExt}`);

    const reqStream: IncomingMessage = await axios.get(fullUri, options).then(
      res => res.data,
      e => {
        this.drupal.logger.warn(`Failed download: ${fullUri}`);
        this.drupal.logger.warn(e);
        throw e;
      }
    );

    reqStream
      .on("error", () => {
        this.drupal.logger.warn(`Error on download for ${fileNameExt}`);
      })
      .on("close", () => {
        this.drupal.logger.debug(`Download ended for ${fileNameExt}`);
      });
    return { reqStream, fileNameExt, imgType: `image/${ext}` };
  }

  async drupalToDirectusImage(
    src: string,
    relativeUri: string
  ): Promise<{ fullUri: string; imageID: number } | null> {
    this.drupal.increaseFilesBarTotal();

    // TODO: fetch file name first, then go through this process
    // may seem counterintuitive but for logging purposes i think it's the right move
    // esp. because there may be generic repeats (unnamed-1, etc)
    const logName = utils.getFileNameFromUri(src);

    if (this.drupal.files.includes(logName)) {
      this.drupal.logger.warn(`Already tried to process ${logName}`);
    }
    this.drupal.files.push(logName);
    this.drupal.filesLeft.push(logName);
    const res:
      | UploadFileFnReturnType
      | Error
      | null = await retry<UploadFileFnReturnType | null>(
      async () => {
        const data = await this.genDataFromSrc(src, relativeUri).catch(err => {
          this.drupal.logger.warn(`Retrying download for ${logName}`);
          this.drupal.logger.warn(err);
          throw err;
        });
        if (!data) {
          return null;
        }
        const { fileData, fileName, fileMimeType } = data;

        const uploadResults: UploadFileFnReturnType = await (this.drupal
          .uploadFileFn as UploadFileFn)(
          fileData,
          fileName,
          fileMimeType
        ).catch(err => {
          this.drupal.logger.warn(`Retrying upload for ${logName}`);
          this.drupal.logger.warn(err);
          throw err;
        });
        return uploadResults;
      },
      { throw_original: true }
    )
      .catch(
        (err): Error => {
          this.drupal.logger.error(`Coundn't transfer file ${logName}`);
          this.drupal.logger.error(err);
          throw err;
        }
      )
      .then(response => {
        const index = this.drupal.filesLeft.indexOf(logName);

        if (index > -1) {
          this.drupal.filesLeft.splice(index, 1);
        }

        this.drupal.incrementFilesBar(1);

        return response;
      })
      .finally(() => {
        if (this.drupal.filesLeft.length < 5) {
          this.drupal.logger.debug(`LEFT: ${this.drupal.filesLeft}`);
        }
      });
    if (res === null || res instanceof Error) return null;
    return { fullUri: res.fullUri, imageID: res.imageID };
  }

  getInlineImageName(relativeUri: string, fileMimeType: string): string {
    this.i += 1;
    return `${utils
      .sanitizeUri(utils.getFileNameFromUri(relativeUri))
      .slice(0, 15)}-inline-image-${this.i}.${fileMimeType.split("/")[1]}`;
  }

  /*
   * File/image processing functions
   */

  async genManagedFileToHTMLTag(fileObj: object): Promise<string> {
    const fid = this.drupal.findFID(fileObj);
    const [
      nodes,
    ] = await this.drupal.db.query(
      "SELECT uri FROM file_managed WHERE fid = ?",
      [fid]
    );
    return `<img src="${encodeURI(nodes[0].uri)}" />`;
  }

  parseBase64ImgSrc(
    src: string,
    relativeUri: string
  ): { fileData: Buffer; fileName: string; fileMimeType: string } {
    // base 64 image
    const block = src.split(";");
    let [fileMimeType, base64src] = block;
    [, fileMimeType] = fileMimeType.split(":");
    [, base64src] = base64src.split(",");
    const fileName = this.getInlineImageName(relativeUri, fileMimeType);
    const buf = Buffer.from(base64src, "base64");
    this.drupal.logger.debug(`Have base64 ${fileName}`);
    return { fileData: buf, fileName, fileMimeType };
  }

  async parseUriImgSrc(
    src: string
  ): Promise<{
    fileData: IncomingMessage;
    fileName: string;
    fileMimeType: string;
  } | null> {
    let uris: string[] = [];
    // public file somwhere
    if (src.match(/^public:\/\/.*/)) {
      // on server
      const { fullUris } = Drupal.parseManagedImageInfo(src);
      uris = uris.concat(fullUris);
    } else {
      // somewhere else
      uris.push(src);
    }
    const res = await this.downloadImage(uris).catch(err => {
      this.drupal.logger.warn(`Download function failed for ${uris}`);
      this.drupal.logger.warn(err);
      throw err;
    });
    if (!res) {
      return null;
    }
    return {
      fileData: res.reqStream,
      fileName: res.fileNameExt,
      fileMimeType: res.imgType,
    };
  }

  async genDataFromSrc(
    src: string,
    relativeUri: string
  ): Promise<{
    fileData: Buffer | IncomingMessage;
    fileName: string;
    fileMimeType: string;
  } | null> {
    if (utils.isBase64(src)) {
      return this.parseBase64ImgSrc(src, relativeUri);
    }
    return await this.parseUriImgSrc(src);
  }

  /*
   * Article body processing methods
   */

  async genProcessManagedToPublicFiles(htmlBody: string): Promise<string> {
    const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
    let newBody = htmlBody;
    if (managedFiles != null) {
      await Bluebird.each(managedFiles, async fileObjStr => {
        const fileObj = JSON.parse(fileObjStr);
        const repl = await this.genManagedFileToHTMLTag(fileObj);
        newBody = newBody.replace(fileObjStr, repl);
      });
    }
    return newBody;
  }

  async genProcessHTMLImageTags(
    htmlBody: string,
    relativeUri: string
  ): Promise<string> {
    const $ = cheerio.load(htmlBody);
    await Bluebird.map($("img").toArray(), async el => {
      const src = $(el).attr("src") as string;
      if (src.match(/cleardot.gif/gi)) {
        $(el).remove();
        return;
      }
      const res = await this.drupalToDirectusImage(src, relativeUri);
      if (res?.fullUri == null) {
        return;
      }
      $(el).attr("src", res.fullUri);
    });
    return $.html();
  }

  async genProcessHTMLInlineFileTags(postData: DrupalArticle): Promise<string> {
    const res1 = await this.genProcessManagedToPublicFiles(postData.body);
    const res2 = this.genProcessHTMLImageTags(res1, postData.relative_uri);
    return res2;
  }
}

export default Drupal;
