import winston, { Logger } from "winston";
import cheerio from "cheerio";
import Bluebird from "bluebird";

import DrupalImage from "./image";

import Drupal, { DrupalArticle } from "./index";

export default class DrupalArticleProcessor {
  public drupal: Drupal;
  public title: string;
  public nid: number;
  private logger: Logger;

  private i: number;

  constructor(drupal: Drupal, title: string, nid: number) {
    this.drupal = drupal;
    this.title = title;
    this.nid = nid;
    this.i = 0;
    this.logger = winston.loggers.get("logger");
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

  async genProcessHTMLInlineFileTags(postData: DrupalArticle): Promise<string> {
    const res1 = await this.genProcessManagedToPublicFiles(postData.body);
    const res2 = this.genProcessHTMLImageTags(res1, postData.relative_path);
    return res2;
  }
}
