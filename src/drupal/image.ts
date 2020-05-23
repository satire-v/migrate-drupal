// import { IncomingMessage } from "http";
// import { Buffer } from "buffer";

// import winston, { Logger } from "winston";
// import Bluebird from "bluebird";
// import axios from "axios";

// import utils from "../utils";

// export default class DrupalImage {
//   public origFileName: string | null;
//   public fullFileName: string;
//   public ext: string;
//   public data: Buffer | IncomingMessage;

//   private srcUri: string;
//   private articlePath: string;
//   private i: number;
//   private logger: Logger;

//   constructor(srcUri: string, articlePath: string, i?: number) {
//     this.logger = winston.loggers.get("logger");
//     this.srcUri = srcUri;
//     this.articlePath = articlePath;
//     if (this.isBase64 && !i) {
//       throw new Error("Must provide indexer object for inline base64 images");
//     }
//     if (this.isBase64) {
//       this.initBase64Image();
//     } else {
//       this.initExternalImage();
//     }
//   }

//   public init(): void {}

//   get mimeType(): string {
//     return `image/${this.ext}`;
//   }

//   get isBase64(): boolean {
//     return !!this.srcUri.match(/.*data:image.*/);
//   }

//   get name(): string {
//     // base64 will have fullFileName set, external will just have the original
//     return this.fullFileName ?? this.origFileName;
//   }

//   private static getPublicImageUris(localUri: string): Array<string> {
//     return [
//       localUri.replace(
//         "public://",
//         "https://satirev.org/sites/default/files/styles/original_cropped/public/"
//       ),
//       localUri.replace("public://", "https://satirev.org/sites/default/files/"),
//     ];
//   }

//   private initBase64Image(): void {
//     let [fileMimeType, base64src] = this.srcUri.split(";");
//     [, base64src] = base64src.split(",");
//     [, fileMimeType] = fileMimeType.split(":");
//     [, this.ext] = fileMimeType.split("/");
//     this.data = Buffer.from(base64src, "base64");
//     this.origFileName = null;
//     this.fullFileName = `${utils
//       .sanitizePath(this.articlePath)
//       .slice(0, 15)}-inline-image-${this.i}.${this.ext}`;
//   }

//   private initExternalImage(): void {
//     this.origFileName = utils.getFileNameFromUri(this.srcUri);
//     // this.getext if easy?
//   }

//   public async getRequest(): Promise<void> {
//     let fullUri: string | null;
//     // public file somwhere
//     if (this.srcUri.match(/^public:\/\/.*/)) {
//       // on drupal server
//       const uris = DrupalImage.getPublicImageUris(this.srcUri);
//       fullUri = await this.genFirstValidUri(uris);
//     } else {
//       // somewhere else on the internet
//       fullUri = this.srcUri;
//     }

//     await this.setNewFileName(fullUri);
//     const res = await this.downloadImage(uris).catch(err => {
//       this.logger.warn(`Download function failed for ${uris}`);
//       this.logger.warn(err);
//       throw err;
//     });
//     // if (!res) {
//     //   return null;
//     // }
//   }

//   private async genFirstValidUri(uris: string[]): Bluebird<string> {
//     let fullUri: string | null = null;
//     let foundIt = false;
//     await Bluebird.mapSeries(uris, async uri => {
//       if (foundIt) return false;
//       await axios.head(uri).then(
//         res => {
//           foundIt = true;
//           fullUri = uri;
//           return res.headers;
//         },
//         err => {
//           // const logger = winston.loggers.get("logger");
//           // logger.debug(`Test for ${uri} failed`);
//           // logger.debug(err);
//           return false;
//         }
//       );
//     });
//     if (!fullUri) {
//       // this.logger.warn(`No valid uri for ${uris}`);
//       // this.logger.warn(err);
//       throw new Error(`No valid uri found for ${this.origFileName}`);
//     }

//     return fullUri;
//   }

//   private async setNewFileName(fullUri: string): Promise<void> {
//     const fileName: string = utils.getFileNameFromUri(fullUri);
//     const fileNameSan: string = fileName.replace(/[^0-9a-zA-Z-._]/g, "");
//     const parts = fileNameSan.split(".");
//     let ext: string | null = null;

//     if (parts.length > 1) {
//       ext = parts.pop() as string;
//       if (/jp(e)?g/i.test(ext)) ext = "jpg";
//       if (ext !== "png") ext = null;
//     }
//     if (ext === null) {
//       // logger.debug(`Getting headers for ${fileName}`);
//       const headers = await axios.head(fullUri).then(
//         res => res.headers,
//         err => {
//           // logger.warn(`Error getting headers for ${fullUri}`);
//           // logger.warn(err);
//           throw err;
//         }
//       );
//       const [, extension] = headers["content-type"]?.split("/");
//       ext = extension as string;
//     }
//     this.ext = ext;
//     this.fullFileName = `${parts
//       .join(".")
//       .slice(0, 40)
//       .replace(/^-|-$/g, "")}.${ext}`;
//   }

//   async downloadImage(
//     uris: Array<string>
//   ): Promise<{
//     reqStream: IncomingMessage;
//     fileNameExt: string;
//     imgType: string;
//   } | null> {
//     if (uris.length === 0) {
//       throw new Error("No uris given for image");
//     }

//     const options: AxiosRequestConfig = {
//       responseType: "stream",
//       timeout: this.drupal.fileTimeout,
//     };

//     this.logger.debug(`Trying to download ${fileNameExt}`);

//     const reqStream: IncomingMessage = await axios.get(fullUri, options).then(
//       res => res.data,
//       e => {
//         this.logger.warn(`Failed download: ${fullUri}`);
//         this.logger.warn(e);
//         throw e;
//       }
//     );

//     reqStream
//       .on("error", () => {
//         this.logger.warn(`Error on download for ${fileNameExt}`);
//       })
//       .on("close", () => {
//         this.logger.debug(`Download ended for ${fileNameExt}`);
//       });
//     return { reqStream, fileNameExt, imgType: `image/${ext}` };
//   }

//   async drupalToDirectusImage(
//     srcUri: string,
//     articleRelativePath: string
//   ): Promise<{ fullUri: string; imageID: number } | null> {
//     this.drupal.increaseFilesBarTotal();

//     // TODO: fetch file name first, then go through this process
//     // may seem counterintuitive but for logging purposes i think it's the right move
//     // esp. because there may be generic repeats (unnamed-1, etc)
//     const logName = utils.getFileNameFromUri(srcUri);

//     if (this.drupal.files.includes(logName)) {
//       this.drupal.logger.warn(`Already tried to process ${logName}`);
//     }
//     this.drupal.files.push(logName);
//     this.drupal.filesLeft.push(logName);
//     const res:
//       | UploadFileFnReturnType
//       | Error
//       | null = await retry<UploadFileFnReturnType | null>(
//       async () => {
//         const data = await this.genDataFromSrc(
//           srcUri,
//           articleRelativePath
//         ).catch(err => {
//           this.drupal.logger.warn(`Retrying download for ${logName}`);
//           this.drupal.logger.warn(err);
//           throw err;
//         });
//         if (!data) {
//           return null;
//         }
//         const { fileData, fileName, fileMimeType } = data;

//         const uploadResults: UploadFileFnReturnType = await (this.drupal
//           .uploadFileFn as UploadFileFn)(
//           fileData,
//           fileName,
//           fileMimeType
//         ).catch(err => {
//           this.drupal.logger.warn(`Retrying upload for ${logName}`);
//           this.drupal.logger.warn(err);
//           throw err;
//         });
//         return uploadResults;
//       },
//       { throw_original: true }
//     )
//       .catch(
//         (err): Error => {
//           this.drupal.logger.error(`Coundn't transfer file ${logName}`);
//           this.drupal.logger.error(err);
//           throw err;
//         }
//       )
//       .then(response => {
//         const index = this.drupal.filesLeft.indexOf(logName);

//         if (index > -1) {
//           this.drupal.filesLeft.splice(index, 1);
//         }

//         this.drupal.incrementFilesBar(1);

//         return response;
//       })
//       .finally(() => {
//         if (this.drupal.filesLeft.length < 5) {
//           this.drupal.logger.debug(`LEFT: ${this.drupal.filesLeft}`);
//         }
//       });
//     if (res === null || res instanceof Error) return null;
//     return { fullUri: res.fullUri, imageID: res.imageID };
//   }
// }
