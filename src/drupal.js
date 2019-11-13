// @flow
import type { Obj } from './utils';

const cheerio = require('cheerio');
const request = require('request-promise-native');

const queries = require('./queries.js');
const utils = require('./utils.js');
const directus = require('./directus.js');

export type DrupalArticle = {
  nid: number,
  title: string,
  created: number,
  changed: number,
  status: 0 | 1,
  body: string,
  caption: string,
  category_id: number,
  category_name: string,
  teaser: string,
  year: number,
  image_id: number,
  image_uri: string,
  relative_uri: string,
  tags_info: string
};

async function fetchFullDatabase(db: Obj): Promise<Array<DrupalArticle>> {
  let [nodes] = await db.query(queries.dumpFullDrupal, ['article', 'node']);
  nodes = JSON.parse(JSON.stringify(nodes));
  return nodes;
}

function getExternalImagePaths(
  localUri: string,
): { fullUri: string, fileNameExisting: string } {
  return {
    fullUri: localUri.replace(
      'public://',
      'http://satirev.org/sites/default/files/',
    ),
    fileNameExisting: utils.getFileNameFromUri(localUri),
  };
}

async function downloadImage(fullUri: string): Promise<string> {
  const options = {
    uri: fullUri,
    encoding: null,
    headers: {
      'user-agent': 'node.js',
    },
  };
  return request(options);
}

function findFID(obj: Obj): ?number {
  if (obj === null || typeof obj !== 'object') return null;
  let res = null;
  Object.keys(obj).forEach((key) => {
    if (key === 'fid') res = obj[key];
    else res = res || findFID(obj[key]);
  });
  return res;
}

async function genManagedFileHTMLTag(fileObj: Obj, db: Obj): Promise<string> {
  const fid = findFID(fileObj);
  const [nodes] = await db.query(
    'SELECT uri FROM file_managed WHERE fid = ?',
    [fid],
  );
  return `<img src="${encodeURI(nodes[0].uri)}" />`;
}

async function genProcessManagedToPublicFiles(
  htmlBody: string,
  db: Obj,
): Promise<string> {
  const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
  if (managedFiles != null) {
    const promises = managedFiles.map(async (fileObjStr) => {
      const fileObj = JSON.parse(fileObjStr);
      const repl = await genManagedFileHTMLTag(fileObj, db);
      htmlBody.replace(fileObjStr, repl);
    });
    await Promise.all(promises);
  }
  return htmlBody;
}

async function genBase64FromSrc(
  src: string,
  relativeUri: string,
  i: number,
): Promise<{ fileName: string, base64src: string, imgType: ?string }> {
  let fileName = '';
  let base64src = null;
  let imgType = null;
  if (src.match(/.*data:image.*/)) {
    // base 64 image
    const block = src.split(';');
    [imgType, base64src] = block;
    [, imgType] = imgType.split(':');
    [, base64src] = base64src.split(',');
    fileName = `${utils.sanitizeUri(utils.getFileNameFromUri(relativeUri)).slice(0, 10)
    }-inline-image-${
      i.toString()
    }.${
      imgType.split('/')[1]}`;
  } else {
    // public image on server
    let fullUri = null;
    if (src.match(/^public:\/\/.*/)) {
      const res = getExternalImagePaths(src);
      fullUri = res.fullUri;
      fileName = decodeURI(res.fileNameExisting);
    } else {
      fullUri = src;
      fileName = utils.getFileNameFromUri(src);
    }
    const buffer = await downloadImage(fullUri);
    base64src = Buffer.from(buffer).toString('base64');
    if (base64src == null) {
      throw new Error('Something went wrong downloading the image from drupal');
    }
  }
  return { fileName, base64src, imgType };
}


async function drupalToDirectusImage(
  src: string,
  relativeUri: string,
  i?: number,
): Promise<{ fullUri: string, imageID: number }> {
  const { base64src, fileName, imgType } = await genBase64FromSrc(
    src,
    relativeUri,
    i || 0,
  );
  if (base64src == null || fileName === '') {
    return Promise.resolve({});
  }
  const { fullUri, imageID } = await directus.uploadImage(
    base64src,
    fileName,
    imgType,
  );
  return { fullUri, imageID };
}

async function genProcessHTMLImageTags(
  htmlBody: string,
  relativeUri: string,
): Promise<string> {
  const $ = cheerio.load(htmlBody);
  const promises = $('img')
    .toArray()
    .map(async (el, i) => {
      // get rid of everything up to the comma
      const src = $(el).attr('src');
      const { fullUri } = await drupalToDirectusImage(
        src,
        relativeUri,
        i,
      );
      if (fullUri == null) {
        return;
      }
      $(el).attr('src', fullUri);
    });
  await Promise.all(promises);
  return $.html();
}

async function processHTMLInlineFileTags(
  postData: DrupalArticle,
  db: Obj,
): Promise<string> {
  const init = postData.body;
  const res1 = await genProcessManagedToPublicFiles(init, db);
  const res2 = await genProcessHTMLImageTags(
    res1,
    postData.relative_uri,
  );
  return res2;
}

module.exports = {
  fetchFullDatabase,
  genProcessHTMLImageTags,
  genProcessManagedToPublicFiles,
  downloadImage,
  processHTMLInlineFileTags,
  drupalToDirectusImage,
};
