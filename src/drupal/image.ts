import { IncomingMessage } from "http";
import { Buffer } from "buffer";

import Bluebird from "bluebird";
import axios, { AxiosRequestConfig } from "axios";

import * as utils from "../utils";
import progress from "../progress";
import logger from "../logger";
import { FILE_TIMEOUT } from "..";

import { ArticleData } from "./article";

abstract class DrupalImage {
  protected _drupalName: string | null = null;
  protected _directusName: string | null = null;
  protected _ext: string | null = null;

  protected _srcUri: string;
  protected _articlePath: string;

  constructor(srcUri: string, relativePath: string) {
    this._srcUri = srcUri;
    this._articlePath = relativePath;
  }

  get isBase64(): boolean {
    return !!this._srcUri.match(/.*data:image.*/);
  }

  get mimeType(): string {
    return `image/${this._ext}`;
  }

  abstract get logName(): string;
  abstract get uploadName(): string;

  abstract get data(): Buffer | IncomingMessage;
}

class Base64DrupalImage extends DrupalImage {
  private _i: number;
  _directusName: string;
  private _buffer: Buffer;

  constructor(srcUri: string, relativePath: string, i: number) {
    super(srcUri, relativePath);
    this._i = i;
    let [fileMimeType, base64src] = this._srcUri.split(";");
    [, base64src] = base64src.split(",");
    [, fileMimeType] = fileMimeType.split(":");
    [, this._ext] = fileMimeType.split("/");
    this._buffer = Buffer.from(base64src, "base64");
    this._directusName = `${utils
      .sanitizePath(this._articlePath)
      .slice(0, 15)}-inline-image-${this._i}.${this._ext}`;
  }

  get logName(): string {
    return this._directusName;
  }

  get uploadName(): string {
    return this._directusName;
  }

  get data(): Buffer {
    return this._buffer;
  }
}

class FileDrupalImage extends DrupalImage {
  _drupalName: string;
  _request: IncomingMessage | null = null;

  constructor(srcUri: string, relativePath: string) {
    super(srcUri, relativePath);
    this._drupalName = utils.getFileNameFromUri(this._srcUri);
  }

  get logName(): string {
    return this._drupalName;
  }

  get uploadName(): string {
    if (!this._directusName)
      throw new Error("Image has not yet been initialized");
    return this._directusName;
  }

  get data(): IncomingMessage {
    if (!this._request) throw new Error("Image has not yet been fetched");
    return this._request;
  }

  public async init(): Promise<void> {
    let fullUri: string | null;
    if (this._srcUri.match(/^public:\/\/.*/)) {
      fullUri = await this.genFirstValidUri();
    } else {
      fullUri = this._srcUri;
    }

    await this.setDirectusName(fullUri);
    await this.downloadImage(fullUri).catch(err => {
      logger.warn(`Download function failed for ${fullUri}`);
      logger.warn(err);
      throw err;
    });
  }

  async downloadImage(fullUri: string): Promise<void> {
    const options: AxiosRequestConfig = {
      responseType: "stream",
      timeout: FILE_TIMEOUT,
    };

    logger.debug(`Trying to download ${this.logName}`);

    const reqStream: IncomingMessage = await axios.get(fullUri, options).then(
      res => res.data,
      e => {
        logger.warn(`Failed download: ${fullUri}`);
        logger.warn(e);
        throw e;
      }
    );

    reqStream
      .on("error", () => {
        logger.warn(`Error on download for ${this.logName}`);
      })
      .on("close", () => {
        logger.debug(`Download ended for ${this.logName}`);
      });

    this._request = reqStream;
  }

  private static getHostedImageUris(hostedUri: string): Array<string> {
    return [
      hostedUri.replace(
        "public://",
        "https://satirev.org/sites/default/files/styles/original_cropped/public/"
      ),
      hostedUri.replace(
        "public://",
        "https://satirev.org/sites/default/files/"
      ),
    ];
  }

  private async setDirectusName(fullUri: string): Promise<void> {
    const fileName: string = utils.getFileNameFromUri(fullUri);
    const fileNameSan: string = fileName.replace(/[^0-9a-zA-Z-._]/g, "");
    const parts = fileNameSan.split(".");
    let ext: string | null = null;

    if (parts.length > 1) {
      ext = parts.pop() as string;
      if (/jp(e)?g/i.test(ext)) ext = "jpg";
      if (ext !== "png") ext = null;
    }
    if (ext === null) {
      // logger.debug(`Getting headers for ${fileName}`);
      const headers = await axios.head(fullUri).then(
        res => res.headers,
        err => {
          // logger.warn(`Error getting headers for ${fullUri}`);
          // logger.warn(err);
          throw err;
        }
      );
      const [, extension] = headers["content-type"]?.split("/");
      ext = extension as string;
    }
    this._ext = ext;
    this._directusName = `${parts
      .join(".")
      .slice(0, 40)
      .replace(/^-|-$/g, "")}.${ext}`;
  }

  private async genFirstValidUri(): Promise<string> {
    const uris = FileDrupalImage.getHostedImageUris(this._srcUri);
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
          // logger.debug(`Test for ${uri} failed`);
          // logger.debug(err);
          return false;
        }
      );
    });
    if (!fullUri) {
      logger.warn(`No valid uri for ${uris}`);
      throw new Error(`No valid uri found for ${this.logName}`);
    }

    return fullUri;
  }
}

// async drupalToDirectusImage(
//   srcUri: string,
//   articleRelativePath: string
// ): Promise<{ fullUri: string; imageID: number } | null> {
//   this.drupal.increaseFilesBarTotal();

//   // TODO: fetch file name first, then go through this process
//   // may seem counterintuitive but for logging purposes i think it's the right move
//   // esp. because there may be generic repeats (unnamed-1, etc)
//   const logName = utils.getFileNameFromUri(srcUri);

//   if (this.drupal.files.includes(logName)) {
//     this.drupal.logger.warn(`Already tried to process ${logName}`);
//   }
//   this.drupal.files.push(logName);
//   this.drupal.filesLeft.push(logName);
//   const res:
//     | UploadFileFnReturnType
//     | Error
//     | null = await retry<UploadFileFnReturnType | null>(
//     async () => {
//       const data = await this.genDataFromSrc(
//         srcUri,
//         articleRelativePath
//       ).catch(err => {
//         this.drupal.logger.warn(`Retrying download for ${logName}`);
//         this.drupal.logger.warn(err);
//         throw err;
//       });
//       if (!data) {
//         return null;
//       }
//       const { fileData, fileName, fileMimeType } = data;

//       const uploadResults: UploadFileFnReturnType = await (this.drupal
//         .uploadFileFn as UploadFileFn)(
//         fileData,
//         fileName,
//         fileMimeType
//       ).catch(err => {
//         this.drupal.logger.warn(`Retrying upload for ${logName}`);
//         this.drupal.logger.warn(err);
//         throw err;
//       });
//       return uploadResults;
//     },
//     { throw_original: true }
//   )
//     .catch(
//       (err): Error => {
//         this.drupal.logger.error(`Coundn't transfer file ${logName}`);
//         this.drupal.logger.error(err);
//         throw err;
//       }
//     )
//     .then(response => {
//       const index = this.drupal.filesLeft.indexOf(logName);

//       if (index > -1) {
//         this.drupal.filesLeft.splice(index, 1);
//       }

//       this.drupal.incrementFilesBar(1);

//       return response;
//     })
//     .finally(() => {
//       if (this.drupal.filesLeft.length < 5) {
//         this.drupal.logger.debug(`LEFT: ${this.drupal.filesLeft}`);
//       }
//     });
//   if (res === null || res instanceof Error) return null;
//   return { fullUri: res.fullUri, imageID: res.imageID };
// }

// async function newImage(srcUri: string, relativePath: string, i?: number) {
//   return await new DrupalImage(srcUri, relativePath, i).init();
// }

// export default { newImage };
