import winston from "winston";
import Bluebird from "bluebird";
import axios from "axios";

export function sanitizeUri(uri: string): string {
  return uri.replace(/[^0-9a-zA-Z-]/g, "");
}

export const getFileNameFromUri = (uri: string): string => {
  const s = uri.split("/");
  const fname = s[s.length - 1];
  return decodeURI(fname);
};

export const isBase64 = (src: string): boolean => {
  return !!src.match(/.*data:image.*/);
};

export async function genFirstValidUri(
  uris: string[]
): Bluebird<string | null> {
  let fullUri: string | null = null;
  let foundIt = false;
  await Bluebird.mapSeries(uris, async uri => {
    if (foundIt) return false;
    await axios.head(uri).then(
      res => {
        foundIt = true;
        fullUri = uri;
        return res.headers;
      },
      err => {
        // const logger = winston.loggers.get("logger");
        // logger.debug(`Test for ${uri} failed`);
        // logger.debug(err);
        return false;
      }
    );
  });

  return fullUri;
}

export async function genFileNameExtfromUri(
  fullUri: string
): Promise<{ fileNameExt: string; ext: string }> {
  const fileName: string = getFileNameFromUri(fullUri);
  const fileNameSan: string = fileName.replace(/[^0-9a-zA-Z-._]/g, "");
  const parts = fileNameSan.split(".");
  let ext: string | null = null;

  if (parts.length > 1) {
    ext = parts.pop() as string;
    if (/jp(e)?g/i.test(ext)) ext = "jpg";
    if (ext !== "png") ext = null;
  }
  if (ext === null) {
    const logger = winston.loggers.get("logger");
    logger.debug(`Getting headers for ${fileName}`);
    const headers = await axios.head(fullUri).then(
      res => res.headers,
      err => {
        logger.warn(`Error getting headers for ${fullUri}`);
        logger.warn(err);
        throw err;
      }
    );
    const [, extension] = headers["content-type"]?.split("/");
    ext = extension as string;
  }
  const fileNameExt = `${parts
    .join(".")
    .slice(0, 40)
    .replace(/^-|-$/g, "")}.${ext}`;

  return { fileNameExt, ext };
}

export default {
  genFirstValidUri,
  genFileNameExtfromUri,
  getFileNameFromUri,
  sanitizeUri,
  isBase64,
};
