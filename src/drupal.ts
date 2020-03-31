/* eslint-disable @typescript-eslint/camelcase */
import fs, { WriteStream } from "fs";
import { Buffer } from "buffer";

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
  fileData: Buffer | NodeJS.ReadableStream,
  fileName: string,
  fileMimeType: string
) => Promise<UploadFileFnReturnType>;

export type UploadFileFnReturnType = { fullUri: string; imageID: number };

export class Drupal {
  multibar: MultiBar | null;
  db: Connection;
  consolidateProgressBars: boolean;
  articleProgressBar: SingleBar | null;
  filesProgressBar: SingleBar | null;
  fileByteTotal: number;
  uploadFileFn: UploadFileFn | null;
  fileDebugStream: WriteStream;
  files: Set<string>;
  fileTimeout: number;

  constructor(db: Connection, consolidateProgressBars = true) {
    this.multibar = new cliProgress.MultiBar({
      format: "{value}/{total} | {percentage}% | {bar} | {message}",
      clearOnComplete: false,
      stream: consolidateProgressBars
        ? process.stderr
        : fs.createWriteStream("./progress.txt"),
      noTTYOutput: !consolidateProgressBars,
      notTTYSchedule: consolidateProgressBars ? 0 : 5000,
      forceRedraw: !consolidateProgressBars,
      hideCursor: true,
    });
    this.db = db;
    this.fileByteTotal = 0;
    this.consolidateProgressBars = consolidateProgressBars;
    this.fileDebugStream = fs.createWriteStream("./debug.txt");
    this.files = new Set();
    this.fileTimeout = 15000;
    this.articleProgressBar = null;
    this.filesProgressBar = null;
    this.uploadFileFn = null;
  }

  newArticleProcessor(): DrupalArticleProcessor {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return new DrupalArticleProcessor(this);
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

  createFileProgressBar(fileName: string): SingleBar | null {
    return (
      this.multibar &&
      this.multibar.create(1, 0, {
        message: `File: ${fileName}`,
      })
    );
  }

  createFilesProgressBar(): void {
    this.filesProgressBar =
      this.multibar &&
      this.multibar.create(this.fileByteTotal, 0, {
        message: "Files",
      });
  }

  increaseFilesBarTotal(delta: number): void | null {
    this.fileByteTotal += delta;
    return (
      this.filesProgressBar &&
      this.filesProgressBar.setTotal(this.fileByteTotal)
    );
  }

  incrementFilesBar(delta: number): void | null {
    return this.filesProgressBar && this.filesProgressBar.increment(delta);
  }

  static setTotal(bar: SingleBar | null, total: number): void | null {
    return bar && bar.setTotal(total);
  }

  static increment(bar: SingleBar | null, delta: number): void | null {
    return bar && bar.increment(delta);
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

  static isBase64(src: string): boolean {
    return !!src.match(/.*data:image.*/);
  }
}

export class DrupalArticleProcessor {
  drupal: Drupal;

  i: number;

  constructor(drupal: Drupal) {
    this.drupal = drupal;
    this.i = 0;
  }

  /*
   * File/image download/upload functions
   */

  async downloadImage(
    uris: Array<string>
  ): Promise<{
    reqStream: NodeJS.ReadableStream;
    fileNameExt: string;
    imgType: string;
  }> {
    if (uris.length === 0) {
      throw new Error("No uris given for image\n");
    }

    const options: AxiosRequestConfig = {
      responseType: "stream",
      timeout: this.drupal.fileTimeout,
    };

    const fullUri: string = await utils.genFirstValidUri(uris);
    const { fileNameExt, ext } = await utils.genFileNameExtfromUri(
      fullUri,
      this.drupal.fileDebugStream
    );

    let bar: SingleBar | null = null;
    if (!this.drupal.consolidateProgressBars) {
      bar = this.drupal.createFileProgressBar(fileNameExt);
    }
    this.drupal.fileDebugStream.write(`Trying to download ${fileNameExt}\n`);

    const reqStream: NodeJS.ReadableStream = await axios
      .get(fullUri, options)
      .then(res => res.data);

    reqStream
      .on("response", response => {
        if (!this.drupal.consolidateProgressBars) {
          Drupal.setTotal(
            bar,
            parseInt(response.headers["content-length"] || "", 10)
          );
        }
      })
      .on("data", chunk => {
        if (!this.drupal.consolidateProgressBars) {
          Drupal.increment(bar, chunk.length);
        }
      })
      .on("error", () => {
        this.drupal.fileDebugStream.write(`Error downloading ${fileNameExt}\n`);
      })
      .on("close", () => {
        this.drupal.fileDebugStream.write(
          `Download ended for ${fileNameExt}\n`
        );
      });
    return { reqStream, fileNameExt, imgType: `image/${ext}` };
  }

  async drupalToDirectusImage(
    src: string,
    relativeUri: string
  ): Promise<{ fullUri: string; imageID: number }> {
    if (this.drupal.consolidateProgressBars) {
      this.drupal.increaseFilesBarTotal(1);
    }

    // dont need more than that for logging purposes
    // and the real file name might need the MIME type fetched
    const logName = utils.getFileNameFromUri(src).slice(0, 25);

    this.drupal.files.add(logName);
    let res: UploadFileFnReturnType | Error = await retry<
      UploadFileFnReturnType
    >(
      async () => {
        const { fileData, fileName, fileMimeType } = await this.genDataFromSrc(
          src,
          relativeUri
        ).catch(err => {
          this.drupal.fileDebugStream.write(
            `Retrying download for ${logName}: ${err}\n`
          );
          throw new Error(err);
        });

        const uploadResults: UploadFileFnReturnType = await (this.drupal
          .uploadFileFn as UploadFileFn)(
          fileData,
          fileName,
          fileMimeType
        ).catch(err => {
          this.drupal.fileDebugStream.write(
            `Retrying upload for ${logName}: ${err}\n`
          );
          throw new Error(err);
        });
        return uploadResults;
      },
      // eslint-disable-next-line @typescript-eslint/camelcase
      { throw_original: true }
    )
      .catch(
        (err): Error => {
          this.drupal.fileDebugStream.write(`Couldn't transfer file: ${err}\n`);
          throw new Error(err);
        }
      )
      .then(response => {
        // Remove from files left to finish downloading
        this.drupal.files.delete(logName);
        // Increment progress bar
        if (this.drupal.consolidateProgressBars) {
          this.drupal.incrementFilesBar(1);
        }
        return response;
      })
      .finally(() => {
        if (this.drupal.files.size < 5) {
          this.drupal.fileDebugStream.write(
            `LEFT: [${[...this.drupal.files].toString()}]\n`
          );
        }
      });
    res = res as UploadFileFnReturnType;
    return { fullUri: res.fullUri, imageID: res.imageID };
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
    const fileName = `${utils
      .sanitizeUri(utils.getFileNameFromUri(relativeUri))
      .slice(0, 15)}-inline-image-${this.i}.${fileMimeType.split("/")[1]}`;
    this.i += 1;
    const buf = Buffer.from(base64src, "base64");
    this.drupal.fileDebugStream.write(`Have base64 ${fileName}\n`);
    return { fileData: buf, fileName, fileMimeType };
  }

  async parseUriImgSrc(
    src: string
  ): Promise<{
    fileData: NodeJS.ReadableStream;
    fileName: string;
    fileMimeType: string;
  }> {
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
      throw new Error(`Error in download function: ${err}`);
    });
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
    fileData: Buffer | NodeJS.ReadableStream;
    fileName: string;
    fileMimeType: string;
  }> {
    if (Drupal.isBase64(src)) {
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
      const { fullUri } = await this.drupalToDirectusImage(src, relativeUri);
      if (fullUri == null) {
        return;
      }
      $(el).attr("src", fullUri);
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
