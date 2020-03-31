import { WriteStream } from "fs";

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

export async function genFirstValidUri(
  uris: string[],
  fileDebugStream: WriteStream
): Bluebird<string | null> {
  let fullUri: string | null = null;
  let foundIt = false;
  if (uris.length === 1) {
    [fullUri] = uris;
  } else if (uris.length > 1) {
    await Bluebird.mapSeries(uris, async uri => {
      if (foundIt) return false;
      await axios.head(uri).then(
        res => {
          foundIt = true;
          fullUri = uri;
          return res.headers;
        },
        err => {
          fileDebugStream.write(`Test for ${uri} failed: ${err}\n`);
          return false;
        }
      );
    });
  }

  return fullUri;
}

export async function genFileNameExtfromUri(
  fullUri: string,
  fileDebugStream: WriteStream
): Promise<{ fileNameExt: string; ext: string }> {
  const fileName: string = getFileNameFromUri(fullUri);
  const fileNameSan: string = fileName.replace(/[^0-9a-zA-Z-._]/g, "");
  const parts = fileNameSan.split(".");
  let ext: string;
  if (parts.length < 1) {
    ext = parts[parts.length - 1];
    switch (ext) {
      case "png":
        ext = "png";
        break;
      case "jpg":
      case "jpeg":
      case "JPG":
        ext = "jpg";
        break;
      default:
        break;
    }
  } else {
    fileDebugStream.write(`Getting headers for ${fileName}\n`);
    const headers = await axios.head(fullUri).then(
      res => res.headers,
      err => {
        fileDebugStream.write(`Headers for ${fullUri}: ${err}\n`);
        throw new Error(err);
      }
    );
    const [, extension] = headers["content-type"]?.split("/");
    ext = extension as string;
  }
  let fileNameExt: string;
  if (parts.length === 1) {
    fileNameExt = [parts[0].slice(0, 40), ext].join(".");
  } else {
    parts.pop();
    fileNameExt = `${parts.join(".").slice(0, 40)}.${ext}`;
  }
  return { fileNameExt, ext };
}

export default {
  genFirstValidUri,
  genFileNameExtfromUri,
  getFileNameFromUri,
  sanitizeUri,
};
