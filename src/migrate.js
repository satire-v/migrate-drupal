// @flow

// const s3 = require('s3');
const request = require('request-promise-native');
const fs = require('fs');
const yargs = require('yargs');
const cheerio = require('cheerio');

const argv = yargs
  .option('db', {
    alias: 'd',
    description: 'The database to query from',
    type: 'string',
  })
  .option('password', {
    alias: 'p',
    description: 'The password to the database to query from',
    type: 'string',
  })
  .help()
  .alias('help', 'h')
  .demandOption(
    ['db', 'password'],
    'Please provide database name and password. Assumed to be running on localhost, user root, port 3306 (MySQL)'
  ).argv;

// function getAWSClient() {
//   return s3.createClient({
//     s3Options: {
//       accessKeyId: 'AKIAR6GW3CSFY5C7D3I3',
//       secretAccessKey: 'q5ZosBOOwlv9/qC3OR3RquEbeDy0svcwgKrFmj45',
//     },
//   });
// }

function sanitizeUri(uri) {
  return uri.replace(/[^0-9a-zA-Z\-]/, '');
}

function getFileNameFromPath(uri) {
  return uri.replace(/^.*(\\|\/|\:)/, '');
}

const catchAwait = async awaitable => {
  try {
    return await awaitable;
  } catch (e) {
    throw e;
  }
};

async function fetchDrupalDatabase() {
  const db = await mysql2.createConnection(dbOptions);
  var [nodes, _] = await db.query(
    `SELECT
      n.nid,
      n.title,
      n.created,
      n.changed,
      n.status AS published,
      b.body_value AS body,
      c.field_caption_value AS caption,
      cat.field_category_tid AS category_id,
      tax.name AS cateogry_name,
      t.field_teaser_value AS teaser,
      y.field_year_value AS year,
      image.field_image_fid as image_id,
      files.uri as image_uri,
      urls.alias as relative_uri,
      GROUP_CONCAT 
      (DISTINCT CONCAT(tags_tax.tid,':',tags_tax.name) SEPARATOR ',') 
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
    WHERE n.type = ? AND urls.source LIKE 'node%' AND n.title LIKE '%malan%'
    GROUP BY n.nid,
      n.title,
      n.created,
      n.changed,
      published,
      body,
      caption,
      category_id,
      cateogry_name,
      teaser,
      year,
      image_id,
      image_uri,
      relative_uri
    ORDER BY n.created DESC
    LIMIT 
      10`,
    ['article', 'node']
  );
  nodes = JSON.parse(JSON.stringify(nodes));
  await db.end();
  return nodes;
}

function parseDrupalPublicImageUri(localUri) {
  return {
    fullUri: localUri.replace(
      'public://',
      'http://satirev.org/sites/default/files/'
    ),
    fileNameExisting: getFileNameFromPath(localUri),
  };
}

async function downloadImageFromDrupal(fullUri) {
  const options = {
    uri: fullUri,
    encoding: null,
    headers: {
      'user-agent': 'node.js',
    },
  };
  return await request(options);
}

async function uploadImageToDirectus(imageBase64, fileName) {
  const options = {
    method: 'POST',
    url: 'http://admin.satirev.org/_/files',
    project: '_',
    auth: {
      // static auth token
      bearer: 'idrdhjfrhcvdbedekjhfvjdbuuelhece',
    },
    formData: {
      filename: fileName,
      data: imageBase64,
    },
    json: true,
  };
  const content = await request(options);
  // return url for sourcing
  // and id for database linking
  return { fullUri: content.data.data.full_url, imageID: content.data.id };
}

function findFID(obj) {
  if (obj === null || typeof obj != 'object') return null;
  var res = null;
  for (let key of Object.keys(obj)) {
    if (key === 'fid') res = obj[key];
    else res = res || findFID(obj[key]);
  }
  return res;
}

async function genManagedFileImageTag(fileObj) {
  const fid = findFID(fileObj);
  const db = await mysql2.createConnection(dbOptions);
  const [nodes, _] = await db.query(
    `SELECT uri FROM file_managed WHERE fid = ?`,
    [fid]
  );
  await db.end();
  return '<img src="' + encodeURI(nodes[0].uri) + '" />';
}

async function convertManagedToPublicFiles(htmlBody) {
  const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
  const promises = managedFiles.map(async fileObjStr => {
    let fileObj = JSON.parse(fileObjStr);
    let repl = await genManagedFileImageTag(fileObj);
    htmlBody = htmlBody.replace(fileObjStr, repl);
  });
  await Promise.all(promises);
  return htmlBody;
}

async function genBase64FromImgTagSrc(src, relativeUri, i) {
  let fileName = '';
  let base64src = null;
  if (src.match(/.*data\:image.*/)) {
    base64src = await Promise.resolve(src.replace(/^[^,]+,{1}/, ''));
    fileName =
      sanitizeUri(getFileNameFromPath(relativeUri)).slice(0, 10) +
      '-inline-image-' +
      i.toString();
  } else if (src.match(/^public\:\/\/.*/)) {
    const { fullUri, fileNameExisting } = parseDrupalPublicImageUri(src);
    const buffer = await downloadImageFromDrupal(fullUri);
    base64src = Buffer.from(buffer).toString('base64');
    fileName = fileNameExisting;
  }
  return { fileName: fileName, base64src: base64src };
}

async function processTagImages(htmlBody, relativeUri) {
  const $ = cheerio.load(htmlBody);
  const promises = $('img')
    .toArray()
    .map(async (el, i) => {
      // get rid of everything up to the comma
      const src = $(el).attr('src');
      const { base64src, fileName } = await genBase64FromImgTagSrc(
        src,
        relativeUri,
        i
      );
      if (base64src == null || fileName == '') {
        return await Promise.resolve(null);
      }
      const { fullUri, imageID } = await uploadImageToDirectus(
        base64src,
        fileName
      );
      $(el).attr('src', fullUri);
    });
  await Promise.all(promises);
  return $.html();
}

async function processAllInlineFiles(postData) {
  postData.body = await convertManagedToPublicFiles(postData.body);
  postData.body = await processTagImages(postData.body, postData.relative_uri);
  console.log(postData.body);
  return postData;
}

async function main() {
  const testArticles = await fetchDrupalDatabase();
  await processAllInlineFiles(testArticles[0]);
}

main();
