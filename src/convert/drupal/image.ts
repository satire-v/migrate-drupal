/* eslint-disable @typescript-eslint/camelcase */
import { IncomingMessage } from "http";
import { Buffer } from "buffer";

import sharp, { Sharp } from "sharp";
import Bluebird from "bluebird";
import axios, { AxiosRequestConfig } from "axios";

import { FILE_TIMEOUT } from "../index";
import * as utils from "../../utils";
import progress from "../../progress";
import logger from "../../logger";
const MB = 1024 * 1024;

export abstract class DrupalImage {
  public static filesTotal = 0;
  public static files: string[] = [];
  public static filesLeft: string[] = [];
  private _id: number;

  protected _srcUri: string;
  protected _articlePath: string;

  protected abstract _ext;

  public abstract logName;
  public abstract fileName: string | Promise<string>;
  public abstract data: () =>
    | Buffer
    | NodeJS.ReadableStream
    | Promise<NodeJS.ReadableStream>;

  constructor(srcUri: string, relativePath: string) {
    this._srcUri = srcUri;
    this._articlePath = relativePath;
    DrupalImage.filesTotal++;
    this._id = progress.FilesBarTotal = DrupalImage.filesTotal;
  }

  protected resolveDuplicateName(logName: string): string {
    let res = logName;
    if (DrupalImage.files.includes(logName)) {
      logger.error(`Duplicate name: ${logName}`);

      res = logName.replace(
        /\.[^.]+$/,
        (match: string) => `${this._id}${match}`
      );
    }
    DrupalImage.files.push(res);
    DrupalImage.filesLeft.push(res);
    return res;
  }
}

class Base64DrupalImage extends DrupalImage {
  private _i: number;
  protected _ext: string;

  public logName: string;
  public fileName: string;
  public data: () => Buffer | NodeJS.ReadableStream;

  constructor(srcUri: string, relativePath: string, i: number) {
    super(srcUri, relativePath);
    this._i = i;
    let [fileMimeType, base64src] = this._srcUri.split(";");
    [, base64src] = base64src.split(",");
    [, fileMimeType] = fileMimeType.split(":");
    [, this._ext] = fileMimeType.split("/");
    this.data = (): Buffer => Buffer.from(base64src, "base64");

    this.logName = this.fileName = this.resolveDuplicateName(
      `${utils.sanitizePath(this._articlePath).slice(0, 15)}-inline-image-${
        this._i
      }.${this._ext}`
    );

    if (this._ext === "gif") {
      this.data = (): Sharp => sharp(this.data() as Buffer).png();
      logger.info(`Converting '${this.logName}' from gif to png`);
    }
    this.fileName.replace("gif", "png");
  }
}

class FileDrupalImage extends DrupalImage {
  protected _ext: Promise<string>;
  private _fullSrcUri: Promise<string>;

  public logName: string;
  public fileName: Promise<string>;
  public data: () => Promise<NodeJS.ReadableStream>;

  constructor(srcUri: string, relativePath: string) {
    super(srcUri, relativePath);
    this.logName = this.resolveDuplicateName(utils.getFileNameFromUri(srcUri));
    this._fullSrcUri = this.getSrcUri();
    this.fileName = this.getFileName().then(res => res.fileName);
    this._ext = this.getFileName().then(res => res.ext);
    this.data = this.download;
  }

  private getSrcUri(): Promise<string> {
    if (this._srcUri.match(/^public:\/\/.*/)) {
      return this.genFirstValidUri();
    } else {
      return Promise.resolve(this._srcUri);
    }
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
        () => {
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

  private async getFileName(): Promise<{ fileName: string; ext: string }> {
    const fileName: string = this.logName.replace(/[^0-9a-zA-Z-._]/g, "");
    const parts = fileName.split(".");
    let ext: string | null = null;

    if (parts.length > 1) {
      ext = parts.pop() as string;
      if (/jp(e)?g/i.test(ext)) ext = "jpg";
      if (ext !== "png") ext = null;
    }
    if (ext === null) {
      // logger.debug(`Getting headers for ${this.logName}`);
      const headers = await axios.head(await this._fullSrcUri).then(
        res => res.headers,
        err => {
          // logger.warn(`Error getting headers for ${this.logName}`);
          // logger.warn(err);
          throw err;
        }
      );
      const [, extension] = headers["content-type"]?.split("/");
      ext = extension as string;
    }
    return {
      fileName: `${parts
        .join(".")
        .slice(0, 40)
        .replace(/^-|-$/g, "")}.${ext}`,
      ext,
    };
  }

  public async download(): Promise<NodeJS.ReadableStream> {
    const options: AxiosRequestConfig = {
      responseType: "stream",
      timeout: FILE_TIMEOUT,
    };

    logger.debug(`Trying to download ${this.logName}`);

    const reqStream: IncomingMessage = await axios
      .get(await this._fullSrcUri, options)
      .then(
        res => res.data,
        e => {
          logger.warn(`Failed download: ${this.logName}`);
          logger.warn(e);
          throw e;
        }
      );

    reqStream.on("close", () => {
      logger.debug(`Download ended for ${this.logName}`);
    });

    let data: NodeJS.ReadableStream = reqStream;

    if ((await this._ext) === "gif") {
      const transformer = sharp().png();
      data = reqStream.pipe(transformer);

      logger.info(`Converting ${this.logName} from gif to png`);
      this.fileName = this.fileName.then(fileName =>
        fileName.replace(".gif", ".png")
      );
    }
    if (
      reqStream.headers["content-length"] &&
      parseInt(reqStream.headers["content-length"], 10) > 5 * MB
    ) {
      const transformer = sharp().resize(1000);
      data = reqStream.pipe(transformer);
      logger.info(
        `Resizing ${this.logName} from ${reqStream.headers["content-length"]}`
      );
    }

    return data;
  }
}

function isBase64(srcUri): boolean {
  return !!srcUri.match(/.*data:image.*/);
}

export function newImage(
  srcUri: string,
  relativePath: string,
  i?: number
): DrupalImage {
  if (isBase64(srcUri)) {
    if (i == null) {
      const err = `Must include index for base64 images; Article ${relativePath}`;
      logger.error(err);
      throw new Error(err);
    }
    return new Base64DrupalImage(srcUri, relativePath, i);
  } else {
    return new FileDrupalImage(srcUri, relativePath);
  }
}
