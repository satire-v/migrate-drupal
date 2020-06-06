/* eslint-disable @typescript-eslint/camelcase */
import { RowDataPacket, FieldPacket } from "mysql2/promise";
import { Pool } from "mysql2/promise";
import cheerio from "cheerio";
import Bluebird from "bluebird";

import directus from "../directus";
import logger from "../../logger";

import { newImage } from "./image";

export interface CategoryMap {
  [name: string]: number;
}

export interface ArticleData {
  nid: number;
  title: string;
  created: number;
  changed: number;
  status: 0 | 1;
  body: string;
  caption: string;
  category_id: number | null;
  category_name: string | null;
  teaser: string;
  year: number;
  image_id: number | null;
  image_uri: string | null;
  relative_path: string;
  tags_info: string;
}

class Article {
  private static _categoriesQuery =
    "SELECT term.name, term.tid FROM taxonomy_term_data term INNER JOIN taxonomy_vocabulary vocab ON term.vid = vocab.vid WHERE vocab.machine_name = 'categories'";

  public static categoryMap: CategoryMap;
  private static db: Pool;

  private _i: number;

  public title: string;
  public created: number;
  public changed: number;
  public status: 0 | 1;
  public body: Promise<string>;
  public caption: string;
  public category_id: Promise<number>;
  public teaser: string;
  public image_id: Promise<number> | null;
  public relative_path: string;
  public tags_info: string;

  constructor(article: ArticleData) {
    this._i = 0;
    const {
      category_name,
      category_id,
      image_uri,
      body,
      relative_path,
    } = article;
    this.title = article.title;
    this.created = article.created;
    this.changed = article.changed;
    this.status = article.status;
    this.caption = article.caption;
    this.teaser = article.teaser;
    this.relative_path = relative_path;
    this.tags_info = article.tags_info;

    this.body = this.genProcessBody(body, relative_path);
    this.category_id = this.genCategoryID(category_id, category_name);
    if (!image_uri) {
      this.image_id = null;
    } else {
      const image = newImage(image_uri, relative_path);
      this.image_id = directus.uploadImage(image).then(res => res.imageID);
    }
  }

  public static async Init(db: Pool): Promise<void> {
    Article.db = db;
    Article.categoryMap = await Article.setCategoryMap();
  }

  public static async setCategoryMap(): Promise<CategoryMap> {
    interface CategoryEntry extends RowDataPacket {
      name: string;
      tid: number;
    }
    const res = (await Article.db.query(Article._categoriesQuery)) as [
      CategoryEntry[],
      FieldPacket[]
    ];
    const entries = res[0];
    const categories = {} as { [name: string]: number };
    entries.forEach(entry => {
      categories[entry.name] = entry.tid;
    });
    logger.info("Generated category map");
    return categories;
  }

  private static allArticlesQuery(limit?: number): string {
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
      ORDER BY n.created DESC ${limit ? `LIMIT ${limit}` : ""}`;
  }

  public static async genAllArticles(limit?: number): Promise<ArticleData[]> {
    const res = (await Article.db.query(Article.allArticlesQuery(limit))) as [
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

  public findFID(obj: object): number | null {
    if (obj === null || typeof obj !== "object") return null;
    let res: null | number = null;
    Object.keys(obj).forEach(key => {
      if (key === "fid") res = obj[key];
      else res = res || this.findFID(obj[key]);
    });
    return res;
  }

  private async genManagedFileHTMLTag(fileObj: object): Promise<string> {
    const fid = this.findFID(fileObj);
    const [
      nodes,
    ] = await Article.db.query("SELECT uri FROM file_managed WHERE fid = ?", [
      fid,
    ]);
    return `<img src="${encodeURI(nodes[0].uri)}" />`;
  }

  private async convertManagedFilesToImgTags(
    htmlBody: string
  ): Promise<string> {
    const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
    let newBody = htmlBody;
    if (managedFiles != null) {
      await Bluebird.each(managedFiles, async fileObjStr => {
        const fileObj = JSON.parse(fileObjStr);
        const tag = await this.genManagedFileHTMLTag(fileObj);
        newBody = newBody.replace(fileObjStr, tag);
      });
    }
    return newBody;
  }

  private async genProcessHTMLImageTags(
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
      const image = newImage(src, relativePath, this._i);
      this._i++;
      const res = await directus.uploadImage(image);
      if (res.directusUri == null) {
        return;
      }
      $(el).attr("src", res.directusUri);
    });
    return $.html();
  }

  private async genProcessBody(
    body: string,
    relative_path: string
  ): Promise<string> {
    const res1 = await this.convertManagedFilesToImgTags(body);
    const res2 = this.genProcessHTMLImageTags(res1, relative_path);
    return res2;
  }

  private async genCategoryID(
    category_id: number | null,
    category_name: string | null
  ): Promise<number> {
    if (!category_name || !category_id) {
      return (await Article.categoryMap)["Everything Else"];
    }
    return category_id;
  }
}

export type DrupalArticle = InstanceType<typeof Article>;

export async function initArticle(db: Pool): Promise<typeof Article> {
  await Article.Init(db);
  return Article;
}
