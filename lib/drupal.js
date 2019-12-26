


const { Buffer } = require('buffer');
const fs = require('fs');
const stream = require('stream');

const request = require('request');
const requestPromise = require('request-promise-native');
const Promise = require('bluebird');
const cheerio = require('cheerio');
const cliProgress = require('cli-progress');

const utils = require('./utils');

























class Drupal {














  constructor(db, consolidateProgressBars = true) {
    this.multibar = new cliProgress.MultiBar({
      format: '{value}/{total} | {percentage}% | {bar} | {message}',
      clearOnComplete: false,
      stream: consolidateProgressBars ? process.stderr : fs.createWriteStream('./progress.txt'),
      noTTYOutput: !consolidateProgressBars,
      notTTYSchedule: consolidateProgressBars ? 0 : 5000,
      forceRedraw: !consolidateProgressBars });

    this.db = db;
    this.fileByteTotal = 0;
    this.consolidateProgressBars = consolidateProgressBars;
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

  createFilesProgressBar() {
    this.filesProgressBar = this.multibar &&
    this.multibar.create(this.fileByteTotal, 0, {
      message: 'Files' });

  }

  increaseFilesBarTotal(delta) {
    this.fileByteTotal += delta;
    return this.filesProgressBar && this.filesProgressBar.setTotal(this.fileByteTotal);
  }

  incrementFilesBar(delta) {
    return this.filesProgressBar && this.filesProgressBar.increment(delta);
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
      categories[entry.name] = entry.tid;
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
    this.i = 0;
  }

  /*
     * File/image download/upload functions
     */

  async downloadImage(
  fullUri)
  {
    const options = {
      encoding: null,
      headers: {
        'user-agent': 'node.js' } };


    const fileName = utils.getFileNameFromUri(fullUri);
    let ext = utils.getValidExt(fileName);
    if (ext === false) {
      const headers = await requestPromise.head(fullUri, options);
      [, ext] = headers['content-type'].split('/');
    }
    const fileNameExt = utils.validateImageExt(fileName, ext);

    let bar = null;
    if (!this.drupal.consolidateProgressBars) {
      bar = this.drupal.createFileProgressBar(fileNameExt);
    }

    const reqStream = request.
    get(fullUri, options).
    on('response', response => {
      if (!this.drupal.consolidateProgressBars) {
        Drupal.setTotal(bar, parseInt(response.headers['content-length'], 10));
      } else {
        this.drupal.increaseFilesBarTotal(parseInt(response.headers['content-length'], 10));
      }
    }).
    on('data', chunk => {
      if (!this.drupal.consolidateProgressBars) {
        Drupal.increment(bar, chunk.length);
      } else {
        this.drupal.incrementFilesBar(chunk.length);
      }
    });
    return { reqStream, fileNameExt, imgType: `image/${ext}` };
  }

  async drupalToDirectusImage(
  src,
  relativeUri)
  {
    const { fileData, fileName, fileMimeType } = await this.genStreamFromSrc(src, relativeUri);
    const { fullUri, imageID } = await this.drupal.uploadFileFn(fileData, fileName, fileMimeType);
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

  async genStreamFromSrc(
  src,
  relativeUri)
  {
    let fileData = null;
    let fileName = '';
    let fileMimeType = '';
    if (src.match(/.*data:image.*/)) {
      // base 64 image
      const block = src.split(';');
      let base64src = null;
      [fileMimeType, base64src] = block;
      [, fileMimeType] = fileMimeType.split(':');
      [, base64src] = base64src.split(',');
      fileName = `${utils.
      sanitizeUri(utils.getFileNameFromUri(relativeUri)).
      slice(0, 15)}-inline-image-${this.i}.${fileMimeType.split('/')[1]}`;
      this.i += 1;
      const buf = Buffer.from(base64src);
      fileData = buf;
    } else {
      // public file somwhere
      let fullUri = null;
      if (src.match(/^public:\/\/.*/)) {
        // on server
        const res = Drupal.parseExternalImageInfo(src);
        fullUri = res.fullUri;
      } else {
        // somewhere else
        fullUri = src;
      }
      const res = await this.downloadImage(fullUri);
      fileData = res.reqStream;
      fileName = res.fileNameExt;
      fileMimeType = res.imgType;
    }
    if (fileData === null) {
      throw new Error('something went wrong creating the file read req');
    }
    if (fileName === '') {
      throw new Error('no filename found');
    }

    return { fileName, fileData, fileMimeType };
  }

  /*
     * Article body processing methods
     */

  async genProcessManagedToPublicFiles(htmlBody) {
    const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
    if (managedFiles != null) {
      await Promise.each(managedFiles, async fileObjStr => {
        const fileObj = JSON.parse(fileObjStr);
        const repl = await this.genManagedFileToHTMLTag(fileObj);
        htmlBody.replace(fileObjStr, repl);
      });
    }
    return htmlBody;
  }

  async genProcessHTMLImageTags(htmlBody, relativeUri) {
    const $ = cheerio.load(htmlBody);
    await Promise.map($('img').toArray(), async el => {
      const src = $(el).attr('src');
      const { fullUri } = await this.drupalToDirectusImage(src, relativeUri);
      if (fullUri == null) {
        return;
      }
      $(el).attr('src', fullUri);
    });
    return $.html();
  }

  async processHTMLInlineFileTags(postData) {
    const res1 = await this.genProcessManagedToPublicFiles(postData.body);
    const res2 = this.genProcessHTMLImageTags(res1, postData.relative_uri);
    return res2;
  }}


module.exports = Drupal;
//# sourceMappingURL=drupal.js.map