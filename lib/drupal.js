



const { Readable } = require('stream');
const { Buffer } = require('buffer');
const fs = require('fs');

const cheerio = require('cheerio');
const request = require('request');
const cliProgress = require('cli-progress');

const utils = require('./utils');
























class Drupal {








  constructor(db, hasMultibar = true) {
    this.multibar = hasMultibar ?
    new cliProgress.MultiBar({
      format: '{value}/{total} | {percentage}% | {bar} | {message}',
      clearOnComplete: false,
      hideCursor: true
      // noTTYOutput: true,
      // notTTYSchedule: 100,
      // forceRedraw: true,
    }) :
    null;
    this.db = db;
  }

  newArticleProcessor() {
    return new DrupalArticleProcessor(this); // eslint-disable-line no-use-before-define
  }

  setUploadFn(fn) {
    this.uploadFileFn = fn;
  }

  /*
     * Progress bar methods
     */

  createArticleProgressBar(total) {
    this.articleProgressBar = this.multibar &&
    this.multibar.create(total, 0, {
      message: 'Articles' });

  }

  async stopDB() {
    await this.db.end();
  }

  stopMultibar() {
    return this.multibar && this.multibar.stop();
  }

  createFileProgressBar(fileName) {
    return (
      this.multibar &&
      this.multibar.create(1, 0, {
        message: `File: ${fileName}` }));


  }

  static setTotal(bar, total) {
    return bar && bar.setTotal(total);
  }

  static increment(bar, delta) {
    return bar && bar.increment(delta);
  }

  incrementArticleBar() {
    return this.articleProgressBar && this.articleProgressBar.increment();
  }

  /*
     * Query construction methods
     */

  static getDrupalArticlesQuery() {
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

  static getDrupalCategoriesQuery() {
    return "SELECT term.name, term.tid FROM taxonomy_term_data term INNER JOIN taxonomy_vocabulary vocab ON term.vid = vocab.vid WHERE vocab.machine_name = 'categories'";
  }

  /*
     * Database get methods
     */

  async genAllArticles() {
    const [nodes] = await this.db.query(Drupal.getDrupalArticlesQuery());
    const articles = JSON.parse(JSON.stringify(nodes));
    return articles;
  }

  async genDrupalCategoriesMap() {
    const [entries] = await this.db.query(Drupal.getDrupalCategoriesQuery());
    const categories = {};
    entries.forEach(entry => {
      categories[entry.name] = entry.tid; // eslint-disable-line no-param-reassign
    });
    return categories;
  }

  /*
     * Parsing util functions
     */

  static parseExternalImageInfo(localUri) {
    return {
      fullUri: localUri.replace('public://', 'http://satirev.org/sites/default/files/'),
      fileNameExisting: utils.getFileNameFromUri(localUri) };

  }

  findFID(obj) {
    if (obj === null || typeof obj !== 'object') return null;
    let res = null;
    Object.keys(obj).forEach(key => {
      if (key === 'fid') res = obj[key];else
      res = res || this.findFID(obj[key]);
    });
    return res;
  }}


class DrupalArticleProcessor {


  constructor(drupal) {
    this.drupal = drupal;
  }

  /*
     * File/image download/upload functions
     */

  downloadImage(fullUri) {
    const options = {
      encoding: null,
      headers: {
        'user-agent': 'node.js' } };


    const progressBar = this.drupal.createFileProgressBar(utils.getFileNameFromUri(fullUri));
    return request.
    get(fullUri, options).
    on('response', data => {
      const totalBytes = parseInt(data.headers['content-length'], 10);
      Drupal.setTotal(progressBar, totalBytes);
    }).
    on('data', chunk => {
      Drupal.increment(progressBar, chunk.length);
    });
  }

  async drupalToDirectusImage(
  src,
  relativeUri)
  {
    const { fileName, req } = this.genReqFromSrc(src, relativeUri);
    const { fullUri, imageID } = await this.drupal.uploadFileFn(fileName, req);
    return { fullUri, imageID };
  }

  /*
     * File/image processing functions
     */

  async genManagedFileToHTMLTag(fileObj) {
    const fid = this.drupal.findFID(fileObj);
    const [nodes] = await this.drupal.db.query('SELECT uri FROM file_managed WHERE fid = ?', [fid]);
    return `<img src="${encodeURI(nodes[0].uri)}" />`;
  }

  genReqFromSrc(src, relativeUri) {
    let fileName = '';
    let reqst = null;
    if (src.match(/.*data:image.*/)) {
      // base 64 image
      const block = src.split(';');
      let [imgType, base64src] = block;
      [, imgType] = imgType.split(':');
      [, base64src] = base64src.split(',');
      fileName = `${utils.
      sanitizeUri(utils.getFileNameFromUri(relativeUri)).
      slice(0, 10)}-inline-image-.${imgType.split('/')[1]}`;
      const buf = Buffer.from(base64src, 'base64');
      const bar = this.drupal.createFileProgressBar(fileName);
      Drupal.setTotal(bar, buf.byteLength);
      const stream = new Readable(buf);
      reqst = stream.on('data', chunk => {
        Drupal.increment(bar, chunk.length);
      });
    } else {
      // public file somwhere
      let fullUri = null;
      if (src.match(/^public:\/\/.*/)) {
        // on server
        const res = Drupal.parseExternalImageInfo(src);
        fullUri = res.fullUri;
        fileName = decodeURI(res.fileNameExisting);
      } else {
        // somewhere else
        fullUri = src;
        fileName = utils.getFileNameFromUri(src);
      }
      const req = this.downloadImage(fullUri);
      reqst = req;
    }
    if (reqst === null) {
      throw new Error('something went wrong creating the file read req');
    }
    if (fileName === '') {
      fileName = 'photo';
    }
    return { fileName, req: reqst };
  }

  /*
     * Article body processing methods
     */

  async genProcessManagedToPublicFiles(htmlBody) {
    const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
    if (managedFiles != null) {
      const promises = managedFiles.map(async fileObjStr => {
        const fileObj = JSON.parse(fileObjStr);
        const repl = await this.genManagedFileToHTMLTag(fileObj);
        htmlBody.replace(fileObjStr, repl);
      });
      await Promise.all(promises);
    }
    return htmlBody;
  }

  async genProcessHTMLImageTags(htmlBody, relativeUri) {
    const $ = cheerio.load(htmlBody);
    const promises = $('img').
    toArray().
    map(async el => {
      const src = $(el).attr('src');
      const { fullUri } = await this.drupalToDirectusImage(src, relativeUri);
      if (fullUri == null) {
        return;
      }
      $(el).attr('src', fullUri);
    });
    await Promise.all(promises);
    return $.html();
  }

  async processHTMLInlineFileTags(postData) {
    const res1 = await this.genProcessManagedToPublicFiles(postData.body);
    const res2 = this.genProcessHTMLImageTags(res1, postData.relative_uri);
    return res2;
  }}


module.exports = Drupal;
//# sourceMappingURL=drupal.js.map