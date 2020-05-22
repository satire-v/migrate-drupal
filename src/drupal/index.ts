/* eslint-disable @typescript-eslint/camelcase */
import { IncomingMessage } from "http";

import winston, { Logger } from "winston";
import { Connection, RowDataPacket, FieldPacket } from "mysql2/promise";
import cliProgress, { MultiBar, SingleBar } from "cli-progress";

import { CategoryMap } from "../directus";

import DrupalArticleProcessor from "./articleProessor";

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
  relative_path: string;
  tags_info: string;
}

export type UploadFileFn = (
  fileData: Buffer | IncomingMessage,
  fileName: string,
  fileMimeType: string
) => Promise<UploadFileFnReturnType>;

export type UploadFileFnReturnType = { fullUri: string; imageID: number };

class Drupal {
  private multibar: MultiBar | null;
  public db: Connection;
  public articleProgressBar: SingleBar | null;
  public filesProgressBar: SingleBar | null;
  public filesTotal: number;
  public uploadFileFn: UploadFileFn | null;
  public logger: Logger;
  public files: string[];
  public filesLeft: string[];
  public fileTimeout: number;

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
        urls.alias as relative_path,
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
        relative_path
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

export default Drupal;
