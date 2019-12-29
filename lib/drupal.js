


const { Buffer } = require('buffer');
const fs = require('fs');
const stream = require('stream');

const request = require('request');
const requestPromise = require('request-promise-native');
const Promise = require('bluebird');
const retry = require('bluebird-retry');
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
      forceRedraw: !consolidateProgressBars,
      hideCursor: true });

    this.db = db;
    this.fileByteTotal = 0;
    this.consolidateProgressBars = consolidateProgressBars;
    this.fileDebugStream = fs.createWriteStream('./debug.txt');
    this.files = new Set();
    this.fileTimeout = 15000;
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

  static parseManagedImageInfo(
  localUri)
  {
    return {
      fullUris: [
      localUri.replace(
      'public://',
      'http://satirev.org/sites/default/files/styles/original_cropped/public/'),

      localUri.replace('public://', 'http://satirev.org/sites/default/files/')],

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
  }

  static isBase64(src) {
    return !!src.match(/.*data:image.*/);
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
  uris)
  {
    const options = {
      encoding: null,
      headers: {
        'user-agent': 'node.js' },

      timeout: this.drupal.fileTimeout };


    if (uris.length === 0) {
      throw new Error('No uris given for image\n');
    }

    let fullUri = null;
    if (uris.length === 1) {
      [fullUri] = uris;
    } else if (uris.length > 1) {
      await Promise.mapSeries(uris, async uri => {
        const response = await requestPromise.head(uri).catch(() => false);
        if (response) {
          fullUri = uri;
          throw new Error({ code: 'success' });
        } else {
          return false;
        }
      }).catch(() => {});
    }

    if (fullUri == null) {
      throw new Error('No uri gotten for image\n');
    }

    const fileName = utils.getFileNameFromUri(fullUri);
    let ext = utils.getValidExt(fileName);
    if (ext === false) {
      this.drupal.fileDebugStream.write(`Getting headers for ${fileName}\n`);
      const headers = await requestPromise.head(fullUri, options).catch(err => {
        this.drupal.fileDebugStream.write(`Failed getting headers: ${err}\n`);
        throw new Error(err);
      });
      [, ext] = headers['content-type'].split('/');
    }
    const fileNameExt = utils.validateImageExt(fileName, ext);

    let bar = null;
    if (!this.drupal.consolidateProgressBars) {
      bar = this.drupal.createFileProgressBar(fileNameExt);
    }

    this.drupal.fileDebugStream.write(`Trying to download ${fileNameExt}\n`);

    const reqStream = request.
    get(fullUri, options).
    on('response', response => {
      if (!this.drupal.consolidateProgressBars) {
        Drupal.setTotal(bar, parseInt(response.headers['content-length'], 10));
      }
    }).
    on('data', chunk => {
      if (!this.drupal.consolidateProgressBars) {
        Drupal.increment(bar, chunk.length);
      }
    }).
    on('error', () => {
      this.drupal.fileDebugStream.write(`Error downloading ${fileNameExt}\n`);
    }).
    on('close', () => {
      this.drupal.fileDebugStream.write(`Download ended for ${fileNameExt}\n`);
    });
    return { reqStream, fileNameExt, imgType: `image/${ext}` };
  }

  async drupalToDirectusImage(
  src,
  relativeUri)
  {
    if (this.drupal.consolidateProgressBars) {
      this.drupal.increaseFilesBarTotal(1);
    }

    // dont need more than that for logging purposes
    // and the real file name might need the MIME type fetched
    const logName = utils.getFileNameFromUri(src).slice(0, 25);

    this.drupal.files.add(logName);
    const res = await retry(
    async () => {
      const { fileData, fileName, fileMimeType } = await this.genDataFromSrc(
      src,
      relativeUri).
      catch(err => {
        this.drupal.fileDebugStream.write(`Retrying download for ${logName}: ${err}\n`);
        throw new Error(err);
      });
      const uploadResults = await await this.drupal.
      uploadFileFn(fileData, fileName, fileMimeType).
      catch(err => {
        this.drupal.fileDebugStream.write(`Retrying upload for ${logName}: ${err}\n`);
        throw new Error(err);
      });
      return uploadResults;
    },
    { throw_original: true }).

    catch(err => {
      this.drupal.fileDebugStream.write(`Couldn't transfer file: ${err}\n`);
      throw new Error(err);
    }).
    then(response => {
      // Remove from files left to finish downloading
      this.drupal.files.delete(logName);
      // Increment progress bar
      if (this.drupal.consolidateProgressBars) {
        this.drupal.incrementFilesBar(1);
      }
      return response;
    }).
    finally(() => {
      if (this.drupal.files.size < 5) {
        this.drupal.fileDebugStream.write(`LEFT: [${[...this.drupal.files].toString()}]\n`);
      }
    });

    return { fullUri: res.fullUri, imageID: res.imageID };
  }

  /*
     * File/image processing functions
     */

  async genManagedFileToHTMLTag(fileObj) {
    const fid = this.drupal.findFID(fileObj);
    const [nodes] = await this.drupal.db.query('SELECT uri FROM file_managed WHERE fid = ?', [fid]);
    return `<img src="${encodeURI(nodes[0].uri)}" />`;
  }

  parseBase64ImgSrc(
  src,
  relativeUri)
  {
    // base 64 image
    const block = src.split(';');
    let [fileMimeType, base64src] = block;
    [, fileMimeType] = fileMimeType.split(':');
    [, base64src] = base64src.split(',');
    const fileName = `${utils.
    sanitizeUri(utils.getFileNameFromUri(relativeUri)).
    slice(0, 15)}-inline-image-${this.i}.${fileMimeType.split('/')[1]}`;
    this.i += 1;
    const buf = Buffer.from(base64src, 'base64');
    this.drupal.fileDebugStream.write(`Have base64 ${fileName}\n`);
    return { fileData: buf, fileName, fileMimeType };
  }

  async parseUriImgSrc(
  src)
  {
    let uris = [];
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
      fileMimeType: res.imgType };

  }

  async genDataFromSrc(
  src,
  relativeUri)
  {
    if (Drupal.isBase64(src)) {
      return this.parseBase64ImgSrc(src, relativeUri);
    }
    return this.parseUriImgSrc(src);
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
      if (src.match(/cleardot.gif/gi)) {
        $(el).remove();
        return;
      }
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