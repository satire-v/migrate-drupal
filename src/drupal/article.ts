/* eslint-disable @typescript-eslint/camelcase */
import { RowDataPacket, FieldPacket } from "mysql2/promise";
import cheerio from "cheerio";
import Bluebird from "bluebird";

import logger from "../logger";
import { CategoryMap } from "../directus";
import DB from "../database";

// import DrupalImage from "./image";

export interface ArticleData {
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

export default class Article {
  // public static filesTotal = 0;
  // public static files: string[] = [];
  // public static filesLeft: string[] = []; Go on Image as static?
  private _article: ArticleData;
  private _i: number;

  constructor(article: ArticleData) {
    this._article = article;
    this._i = 0;
  }

  private static _allArticlesQuery = `SELECT
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

  private static _categoriesQuerty =
    "SELECT term.name, term.tid FROM taxonomy_term_data term INNER JOIN taxonomy_vocabulary vocab ON term.vid = vocab.vid WHERE vocab.machine_name = 'categories'";

  public static async genAllArticles(): Promise<ArticleData[]> {
    const res = (await DB.query(Article._allArticlesQuery)) as [
      RowDataPacket[],
      FieldPacket[]
    ];
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
   * @method @public @static @async
   * @returns { Promise<CategoryMap> }
   * Maps category names to category ids from the drupal database
   */
  public static async genDrupalCategoriesMap(): Promise<CategoryMap> {
    interface CategoryEntry extends RowDataPacket {
      name: string;
      tid: number;
    }
    const res = (await DB.query(Article._categoriesQuerty)) as [
      CategoryEntry[],
      FieldPacket[]
    ];
    const entries = res[0];
    const categories = {} as { [name: string]: number };
    entries.forEach(entry => {
      categories[entry.name] = entry.tid;
    });
    return categories;
  }

  public static findFID(obj: object): number | null {
    if (obj === null || typeof obj !== "object") return null;
    let res: null | number = null;
    Object.keys(obj).forEach(key => {
      if (key === "fid") res = obj[key];
      else res = res || this.findFID(obj[key]);
    });
    return res;
  }

  private static async genManagedFileHTMLTag(fileObj: object): Promise<string> {
    const fid = Article.findFID(fileObj);
    const [nodes] = await DB.query(
      "SELECT uri FROM file_managed WHERE fid = ?",
      [fid]
    );
    return `<img src="${encodeURI(nodes[0].uri)}" />`;
  }

  async convertManagedFilesToImgTags(htmlBody: string): Promise<string> {
    const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
    let newBody = htmlBody;
    if (managedFiles != null) {
      await Bluebird.each(managedFiles, async fileObjStr => {
        const fileObj = JSON.parse(fileObjStr);
        const tag = await Article.genManagedFileHTMLTag(fileObj);
        newBody = newBody.replace(fileObjStr, tag);
      });
    }
    return newBody;
  }

  async genProcessHTMLImageTags(
    htmlBody: string,
    relativePath: string
  ): Promise<string> {
    const $ = cheerio.load(htmlBody);
    await Bluebird.map($("img").toArray(), async el => {
      const src = $(el).attr("src") as string;
      if (src.match(/cleardot.gif/gi)) {
        $(el).remove();
        return;
      }
      const res = await this.drupalToDirectusImage(src, relativePath);
      if (res?.fullUri == null) {
        return;
      }
      $(el).attr("src", res.fullUri);
    });
    return $.html();
  }

  async genProcessHTMLInlineFileTags(postData: ArticleData): Promise<string> {
    const res1 = await this.convertManagedFilesToImgTags(postData.body);
    const res2 = this.genProcessHTMLImageTags(res1, postData.relative_path);
    return res2;
  }
}
