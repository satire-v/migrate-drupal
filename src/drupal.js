// @flow
import type { Obj, DrupalArticle } from "./utils.js";

const cheerio = require("cheerio");
const queries = require("./queries.js");
const utils = require("./utils.js");
const request = require("request-promise-native");
const directus = require("./directus.js");

async function fetchFullDatabase(db: Obj): Promise<Array<DrupalArticle>> {
  var [nodes, ] = await db.query(queries.dumpFullDrupal, ["article", "node"]);
  nodes = JSON.parse(JSON.stringify(nodes));
  return nodes;
}

function getExternalImagePaths(
  localUri: string
): { fullUri: string, fileNameExisting: string } {
  return {
    fullUri: localUri.replace(
      "public://",
      "http://satirev.org/sites/default/files/"
    ),
    fileNameExisting: utils.getFileNameFromUri(localUri)
  };
}

async function downloadImage(fullUri: string): Promise<string> {
  const options = {
    uri: fullUri,
    encoding: null,
    headers: {
      "user-agent": "node.js"
    }
  };
  return await request(options);
}

function findFID(obj: Obj): ?number {
  if (obj === null || typeof obj != "object") return null;
  var res = null;
  for (let key of Object.keys(obj)) {
    if (key === "fid") res = obj[key];
    else res = res || findFID(obj[key]);
  }
  return res;
}

async function genManagedFileHTMLTag(fileObj: Obj, db: Obj): Promise<string> {
  const fid = findFID(fileObj);
  const [nodes, ] = await db.query(
    `SELECT uri FROM file_managed WHERE fid = ?`,
    [fid]
  );
  return '<img src="' + encodeURI(nodes[0].uri) + '" />';
}

async function genProcessManagedToPublicFiles(
  htmlBody: string,
  db: Obj
): Promise<string> {
  const managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
  if (managedFiles != null) {
    const promises = managedFiles.map(async fileObjStr => {
      let fileObj = JSON.parse(fileObjStr);
      let repl = await genManagedFileHTMLTag(fileObj, db);
      htmlBody = htmlBody.replace(fileObjStr, repl);
    });
    await Promise.all(promises);
  }
  return htmlBody;
}

async function genBase64FromSrc(
  src: string,
  relativeUri: string,
  i: number
): Promise<{ fileName: string, base64src: string, imgType: ?string }> {
  var fileName = "";
  var base64src = null;
  var imgType = null;
  if (src.match(/.*data:image.*/)) {
    // base 64 image
    const block = src.split(";");
    base64src = block[1].split(",")[1];
    imgType = block[0].split(":")[1];
    fileName =
      utils.sanitizeUri(utils.getFileNameFromUri(relativeUri)).slice(0, 10) +
      "-inline-image-" +
      i.toString() +
      "." +
      imgType.split("/")[1];
  } else {
    // public image on server
    var fullUri = null;
    if (src.match(/^public:\/\/.*/)) {
      var res = getExternalImagePaths(src);
      fullUri = res.fullUri;
      fileName = decodeURI(res.fileNameExisting);
    } else {
      fullUri = src;
      fileName = utils.getFileNameFromUri(src);
    }
    const buffer = await downloadImage(fullUri);
    base64src = Buffer.from(buffer).toString("base64");
    if (base64src == null) {
      throw "Something went wrong downloading the image from drupal";
    }
  }
  return { fileName: fileName, base64src: base64src, imgType: imgType };
}

async function genProcessHTMLImageTags(
  htmlBody: string,
  relativeUri: string
): Promise<string> {
  const $ = cheerio.load(htmlBody);
  const promises = $("img")
    .toArray()
    .map(async (el, i) => {
      // get rid of everything up to the comma
      const src = $(el).attr("src");
      const { fullUri,  } = await drupalToDirectusImage(
        src,
        relativeUri,
        i
      );
      if (fullUri == null) {
        return;
      }
      $(el).attr("src", fullUri);
    });
  await Promise.all(promises);
  return $.html();
}

async function drupalToDirectusImage(
  src: string,
  relativeUri: string,
  i?: number
): Promise<{ fullUri: string, imageID: number }> {
  const { base64src, fileName, imgType } = await genBase64FromSrc(
    src,
    relativeUri,
    i || 0
  );
  if (base64src == null || fileName == "") {
    return await Promise.resolve({});
  }
  const { fullUri, imageID } = await directus.uploadImage(
    base64src,
    fileName,
    imgType
  );
  return { fullUri: fullUri, imageID: imageID };
}

module.exports = {
  fetchFullDatabase,
  genProcessHTMLImageTags,
  genProcessManagedToPublicFiles,
  downloadImage,
  drupalToDirectusImage
};
