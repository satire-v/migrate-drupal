


const cheerio = require('cheerio');
const request = require('request-promise-native');

const utils = require('./utils.js');
const directus = require('./directus.js');



















const getDrupalArticlesQuery = `SELECT
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
      WHERE n.type = article AND urls.source LIKE 'node%'
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
      ORDER BY n.created DESC
      LIMIT 10`;

function getAllArticles(db) {
  const [nodes] = db.query(getDrupalArticlesQuery);
  const articles = JSON.parse(JSON.stringify(nodes));
  return articles;
}

const getDrupalCategoriesQuery = 'SELECT term.name, term.tid FROM taxonomy_term_data term INNER JOIN taxonomy_vocabulary vocab ON term.vid = vocab.vid WHERE vocab.machine_name = \'categories\'';

async function getDrupalCategoriesMap(db) {
  const [entries] = await db.query(getDrupalCategoriesQuery);
  const categories = {};
  entries.forEach(entry => {
    categories[entry.name] = entry.tid; // eslint-disable-line no-param-reassign
  });
  return categories;
}

function parseExternalImageInfo(
localUri)
{
  return {
    fullUri: localUri.replace(
    'public://',
    'http://satirev.org/sites/default/files/'),

    fileNameExisting: utils.getFileNameFromUri(localUri) };

}

async function downloadImage(fullUri) {
  const options = {
    uri: fullUri,
    encoding: null,
    headers: {
      'user-agent': 'node.js' } };


  return request(options);
}

function findFID(obj) {
  if (obj === null || typeof obj !== 'object') return null;
  let res = null;
  Object.keys(obj).forEach(key => {
    if (key === 'fid') res = obj[key];else
    res = res || findFID(obj[key]);
  });
  return res;
}

async function genManagedFileHTMLTag(db, fileObj) {
  const fid = findFID(fileObj);
  const [nodes] = await db.query(
  'SELECT uri FROM file_managed WHERE fid = ?',
  [fid]);

  return `<img src="${encodeURI(nodes[0].uri)}" />`;
}

async function genProcessManagedToPublicFiles(
db,
htmlBody)
{
  const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
  if (managedFiles != null) {
    const promises = managedFiles.map(async fileObjStr => {
      const fileObj = JSON.parse(fileObjStr);
      const repl = await genManagedFileHTMLTag(db, fileObj);
      htmlBody.replace(fileObjStr, repl);
    });
    await Promise.all(promises);
  }
  return htmlBody;
}

async function genBase64FromSrc(
src,
relativeUri)
{
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
    }-inline-image-.${
    imgType.split('/')[1]}`;
  } else {
    // public file somwhere
    let fullUri = null;
    // on server
    if (src.match(/^public:\/\/.*/)) {
      const res = parseExternalImageInfo(src);
      fullUri = res.fullUri;
      fileName = decodeURI(res.fileNameExisting);
    } else {
      // somewhere else
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
src,
relativeUri)
{
  const { base64src, fileName, imgType } = await genBase64FromSrc(
  src,
  relativeUri);

  if (base64src == null || fileName === '') {
    return Promise.resolve({});
  }
  const { fullUri, imageID } = await directus.uploadImage(
  base64src,
  fileName,
  imgType);

  return { fullUri, imageID };
}

async function genProcessHTMLImageTags(
htmlBody,
relativeUri)
{
  const $ = cheerio.load(htmlBody);
  const promises = $('img').
  toArray().
  map(async el => {
    const src = $(el).attr('src');
    const { fullUri } = await drupalToDirectusImage(
    src,
    relativeUri);

    if (fullUri == null) {
      return;
    }
    $(el).attr('src', fullUri);
  });
  await Promise.all(promises);
  return $.html();
}

async function processHTMLInlineFileTags(
db,
postData)
{
  const res1 = await genProcessManagedToPublicFiles(db, postData.body);
  const res2 = genProcessHTMLImageTags(
  res1,
  postData.relative_uri);

  return res2;
}

module.exports = {
  getAllArticles,
  genProcessHTMLImageTags,
  genProcessManagedToPublicFiles,
  downloadImage,
  processHTMLInlineFileTags,
  drupalToDirectusImage,
  getDrupalCategoriesMap };
//# sourceMappingURL=drupal.js.map