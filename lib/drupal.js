"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = __importDefault(require("fs"));
var buffer_1 = require("buffer");
var request_promise_1 = __importDefault(require("request-promise"));
var request_1 = __importDefault(require("request"));
var cli_progress_1 = __importDefault(require("cli-progress"));
var cheerio_1 = __importDefault(require("cheerio"));
var bluebird_retry_1 = __importDefault(require("bluebird-retry"));
var bluebird_1 = __importDefault(require("bluebird"));
var utils_1 = __importDefault(require("./utils"));
/* Drupal class/object, which houses the progress of the migration,
as well as logging info. Makes it easier to use universal objects
without passing them between functions */
var Drupal = /** @class */ (function () {
    function Drupal(db, consolidateProgressBars) {
        if (consolidateProgressBars === void 0) { consolidateProgressBars = true; }
        this.multibar = new cli_progress_1.default.MultiBar({
            format: "{value}/{total} | {percentage}% | {bar} | {message}",
            clearOnComplete: false,
            stream: consolidateProgressBars
                ? process.stderr
                : fs_1.default.createWriteStream("./progress.txt"),
            noTTYOutput: !consolidateProgressBars,
            notTTYSchedule: consolidateProgressBars ? 0 : 5000,
            forceRedraw: !consolidateProgressBars,
            hideCursor: true,
        });
        this.db = db;
        this.fileByteTotal = 0;
        this.consolidateProgressBars = consolidateProgressBars;
        this.fileDebugStream = fs_1.default.createWriteStream("./debug.txt");
        this.files = new Set();
        this.fileTimeout = 15000;
        this.articleProgressBar = null;
        this.filesProgressBar = null;
        this.uploadFileFn = null;
    }
    Drupal.prototype.newArticleProcessor = function () {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new DrupalArticleProcessor(this);
    };
    Drupal.prototype.setUploadFn = function (fn) {
        this.uploadFileFn = fn;
    };
    /*
     * Progress bar methods
     */
    Drupal.prototype.createArticleProgressBar = function (total) {
        this.articleProgressBar =
            this.multibar &&
                this.multibar.create(total, 0, {
                    message: "Articles",
                });
    };
    Drupal.prototype.stopDB = function () {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db.end()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    Drupal.prototype.stopMultibar = function () {
        return this.multibar && this.multibar.stop();
    };
    Drupal.prototype.createFileProgressBar = function (fileName) {
        return (this.multibar &&
            this.multibar.create(1, 0, {
                message: "File: " + fileName,
            }));
    };
    Drupal.prototype.createFilesProgressBar = function () {
        this.filesProgressBar =
            this.multibar &&
                this.multibar.create(this.fileByteTotal, 0, {
                    message: "Files",
                });
    };
    Drupal.prototype.increaseFilesBarTotal = function (delta) {
        this.fileByteTotal += delta;
        return (this.filesProgressBar &&
            this.filesProgressBar.setTotal(this.fileByteTotal));
    };
    Drupal.prototype.incrementFilesBar = function (delta) {
        return this.filesProgressBar && this.filesProgressBar.increment(delta);
    };
    Drupal.setTotal = function (bar, total) {
        return bar && bar.setTotal(total);
    };
    Drupal.increment = function (bar, delta) {
        return bar && bar.increment(delta);
    };
    Drupal.prototype.incrementArticleBar = function () {
        return this.articleProgressBar && this.articleProgressBar.increment();
    };
    /*
     * Query construction methods
     */
    Drupal.getDrupalArticlesQuery = function () {
        return "SELECT\n        n.nid,\n        n.title,\n        n.created,\n        n.changed,\n        n.status AS status,\n        b.body_value AS body,\n        c.field_caption_value AS caption,\n        cat.field_category_tid AS category_id,\n        tax.name AS category_name,\n        t.field_teaser_value AS teaser,\n        y.field_year_value AS year,\n        image.field_image_fid as image_id,\n        files.uri as image_uri,\n        urls.alias as relative_uri,\n        GROUP_CONCAT \n        (DISTINCT CONCAT(tags_tax.name) SEPARATOR ',') \n        AS tags_info\n      FROM\n        node n\n        LEFT JOIN field_data_body b ON b.entity_id = n.nid\n        LEFT JOIN field_data_field_caption c ON c.entity_id = n.nid\n        LEFT JOIN field_data_field_category cat ON cat.entity_id = n.nid\n        LEFT JOIN taxonomy_term_data tax ON tax.tid = cat.field_category_tid\n        LEFT JOIN field_data_field_teaser t ON t.entity_id = n.nid\n        LEFT JOIN field_data_field_year y ON y.entity_id = n.nid\n        LEFT JOIN field_data_field_tags tags ON tags.entity_id = n.nid\n        LEFT JOIN taxonomy_term_data tags_tax ON tags_tax.tid = tags.field_tags_tid\n        LEFT JOIN field_data_field_image image ON image.entity_id = n.nid\n        LEFT JOIN file_managed files ON files.fid = image.field_image_fid\n        LEFT JOIN url_alias urls ON CAST(REGEXP_REPLACE(urls.source, '[^0-9]', '') AS UNSIGNED) = n.nid\n      WHERE n.type = 'article' AND urls.source LIKE 'node%'\n      GROUP BY n.nid,\n        n.title,\n        n.created,\n        n.changed,\n        status,\n        body,\n        caption,\n        category_id,\n        category_name,\n        teaser,\n        year,\n        image_id,\n        image_uri,\n        relative_uri\n      ORDER BY n.created DESC";
    };
    Drupal.getDrupalCategoriesQuery = function () {
        return "SELECT term.name, term.tid FROM taxonomy_term_data term INNER JOIN taxonomy_vocabulary vocab ON term.vid = vocab.vid WHERE vocab.machine_name = 'categories'";
    };
    /*
     * Database get methods
     */
    Drupal.prototype.genAllArticles = function () {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var _a, nodes, articles;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.db.query(Drupal.getDrupalArticlesQuery())];
                    case 1:
                        _a = __read.apply(void 0, [_b.sent(), 1]), nodes = _a[0];
                        articles = JSON.parse(JSON.stringify(nodes));
                        return [2 /*return*/, articles];
                }
            });
        });
    };
    /**
     * @method @async
     * Maps category names to category ids from the drupal database
     */
    Drupal.prototype.genDrupalCategoriesMap = function () {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var _a, entries, categories;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.db.query(Drupal.getDrupalCategoriesQuery())];
                    case 1:
                        _a = __read.apply(void 0, [_b.sent(), 1]), entries = _a[0];
                        categories = {};
                        entries.forEach(function (entry) {
                            categories[entry.name] = entry.tid;
                        });
                        return [2 /*return*/, categories];
                }
            });
        });
    };
    /*
     * Parsing util functions
     */
    Drupal.parseManagedImageInfo = function (localUri) {
        return {
            fullUris: [
                localUri.replace("public://", "http://satirev.org/sites/default/files/styles/original_cropped/public/"),
                localUri.replace("public://", "http://satirev.org/sites/default/files/"),
            ],
            fileNameExisting: utils_1.default.getFileNameFromUri(localUri),
        };
    };
    Drupal.prototype.findFID = function (obj) {
        var _this = this;
        if (obj === null || typeof obj !== "object")
            return null;
        var res = null;
        Object.keys(obj).forEach(function (key) {
            if (key === "fid")
                res = obj[key];
            else
                res = res || _this.findFID(obj[key]);
        });
        return res;
    };
    Drupal.isBase64 = function (src) {
        return !!src.match(/.*data:image.*/);
    };
    return Drupal;
}());
exports.Drupal = Drupal;
var DrupalArticleProcessor = /** @class */ (function () {
    function DrupalArticleProcessor(drupal) {
        this.drupal = drupal;
        this.i = 0;
    }
    /*
     * File/image download/upload functions
     */
    DrupalArticleProcessor.prototype.downloadImage = function (uris) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var options, fullUri, fileName, ext, headers, _a, extension, fileNameExt, bar, reqStream;
            var _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        options = {
                            encoding: null,
                            headers: {
                                "user-agent": "node.js",
                            },
                            timeout: this.drupal.fileTimeout,
                        };
                        if (uris.length === 0) {
                            throw new Error("No uris given for image\n");
                        }
                        fullUri = null;
                        if (!(uris.length === 1)) return [3 /*break*/, 1];
                        _b = __read(uris, 1), fullUri = _b[0];
                        return [3 /*break*/, 3];
                    case 1:
                        if (!(uris.length > 1)) return [3 /*break*/, 3];
                        return [4 /*yield*/, bluebird_1.default.mapSeries(uris, function (uri) { return __awaiter(_this, void 0, void 0, function () {
                                var response;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, request_promise_1.default.head(uri).catch(function () { return false; })];
                                        case 1:
                                            response = _a.sent();
                                            if (response) {
                                                fullUri = uri;
                                                throw new Error("success");
                                            }
                                            else {
                                                return [2 /*return*/, false];
                                            }
                                            return [2 /*return*/];
                                    }
                                });
                            }); }).catch(function () { })];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        if (fullUri == null) {
                            throw new Error("No uri gotten for image\n");
                        }
                        fileName = utils_1.default.getFileNameFromUri(fullUri);
                        ext = utils_1.default.getValidExt(fileName);
                        if (!(ext === false)) return [3 /*break*/, 5];
                        this.drupal.fileDebugStream.write("Getting headers for " + fileName + "\n");
                        return [4 /*yield*/, request_promise_1.default.head(fullUri, options).catch(function (err) {
                                _this.drupal.fileDebugStream.write("Failed getting headers: " + err + "\n");
                                throw new Error(err);
                            })];
                    case 4:
                        headers = _c.sent();
                        _a = __read(headers["content-type"].split("/"), 2), extension = _a[1];
                        ext = extension;
                        _c.label = 5;
                    case 5:
                        fileNameExt = utils_1.default.validateImageExt(fileName, ext);
                        bar = null;
                        if (!this.drupal.consolidateProgressBars) {
                            bar = this.drupal.createFileProgressBar(fileNameExt);
                        }
                        this.drupal.fileDebugStream.write("Trying to download " + fileNameExt + "\n");
                        reqStream = request_1.default
                            .get(fullUri, options)
                            .on("response", function (response) {
                            if (!_this.drupal.consolidateProgressBars) {
                                Drupal.setTotal(bar, parseInt(response.headers["content-length"] || "", 10));
                            }
                        })
                            .on("data", function (chunk) {
                            if (!_this.drupal.consolidateProgressBars) {
                                Drupal.increment(bar, chunk.length);
                            }
                        })
                            .on("error", function () {
                            _this.drupal.fileDebugStream.write("Error downloading " + fileNameExt + "\n");
                        })
                            .on("close", function () {
                            _this.drupal.fileDebugStream.write("Download ended for " + fileNameExt + "\n");
                        });
                        return [2 /*return*/, { reqStream: reqStream, fileNameExt: fileNameExt, imgType: "image/" + ext }];
                }
            });
        });
    };
    DrupalArticleProcessor.prototype.drupalToDirectusImage = function (src, relativeUri) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var logName, res;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.drupal.consolidateProgressBars) {
                            this.drupal.increaseFilesBarTotal(1);
                        }
                        logName = utils_1.default.getFileNameFromUri(src).slice(0, 25);
                        this.drupal.files.add(logName);
                        return [4 /*yield*/, bluebird_retry_1.default(function () { return __awaiter(_this, void 0, void 0, function () {
                                var _a, fileData, fileName, fileMimeType, uploadResults;
                                var _this = this;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0: return [4 /*yield*/, this.genDataFromSrc(src, relativeUri).catch(function (err) {
                                                _this.drupal.fileDebugStream.write("Retrying download for " + logName + ": " + err + "\n");
                                                throw new Error(err);
                                            })];
                                        case 1:
                                            _a = _b.sent(), fileData = _a.fileData, fileName = _a.fileName, fileMimeType = _a.fileMimeType;
                                            return [4 /*yield*/, this.drupal
                                                    .uploadFileFn(fileData, fileName, fileMimeType).catch(function (err) {
                                                    _this.drupal.fileDebugStream.write("Retrying upload for " + logName + ": " + err + "\n");
                                                    throw new Error(err);
                                                })];
                                        case 2:
                                            uploadResults = _b.sent();
                                            return [2 /*return*/, uploadResults];
                                    }
                                });
                            }); }, 
                            // eslint-disable-next-line @typescript-eslint/camelcase
                            { throw_original: true })
                                .catch(function (err) {
                                _this.drupal.fileDebugStream.write("Couldn't transfer file: " + err + "\n");
                                throw new Error(err);
                            })
                                .then(function (response) {
                                // Remove from files left to finish downloading
                                _this.drupal.files.delete(logName);
                                // Increment progress bar
                                if (_this.drupal.consolidateProgressBars) {
                                    _this.drupal.incrementFilesBar(1);
                                }
                                return response;
                            })
                                .finally(function () {
                                if (_this.drupal.files.size < 5) {
                                    _this.drupal.fileDebugStream.write("LEFT: [" + __spread(_this.drupal.files).toString() + "]\n");
                                }
                            })];
                    case 1:
                        res = _a.sent();
                        res = res;
                        return [2 /*return*/, { fullUri: res.fullUri, imageID: res.imageID }];
                }
            });
        });
    };
    /*
     * File/image processing functions
     */
    DrupalArticleProcessor.prototype.genManagedFileToHTMLTag = function (fileObj) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var fid, _a, nodes;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        fid = this.drupal.findFID(fileObj);
                        return [4 /*yield*/, this.drupal.db.query("SELECT uri FROM file_managed WHERE fid = ?", [fid])];
                    case 1:
                        _a = __read.apply(void 0, [_b.sent(), 1]), nodes = _a[0];
                        return [2 /*return*/, "<img src=\"" + encodeURI(nodes[0].uri) + "\" />"];
                }
            });
        });
    };
    DrupalArticleProcessor.prototype.parseBase64ImgSrc = function (src, relativeUri) {
        var _a, _b;
        // base 64 image
        var block = src.split(";");
        var _c = __read(block, 2), fileMimeType = _c[0], base64src = _c[1];
        _a = __read(fileMimeType.split(":"), 2), fileMimeType = _a[1];
        _b = __read(base64src.split(","), 2), base64src = _b[1];
        var fileName = utils_1.default
            .sanitizeUri(utils_1.default.getFileNameFromUri(relativeUri))
            .slice(0, 15) + "-inline-image-" + this.i + "." + fileMimeType.split("/")[1];
        this.i += 1;
        var buf = buffer_1.Buffer.from(base64src, "base64");
        this.drupal.fileDebugStream.write("Have base64 " + fileName + "\n");
        return { fileData: buf, fileName: fileName, fileMimeType: fileMimeType };
    };
    DrupalArticleProcessor.prototype.parseUriImgSrc = function (src) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var uris, fullUris, res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        uris = [];
                        // public file somwhere
                        if (src.match(/^public:\/\/.*/)) {
                            fullUris = Drupal.parseManagedImageInfo(src).fullUris;
                            uris = uris.concat(fullUris);
                        }
                        else {
                            // somewhere else
                            uris.push(src);
                        }
                        return [4 /*yield*/, this.downloadImage(uris).catch(function (err) {
                                throw new Error("Error in download function: " + err);
                            })];
                    case 1:
                        res = _a.sent();
                        return [2 /*return*/, {
                                fileData: res.reqStream,
                                fileName: res.fileNameExt,
                                fileMimeType: res.imgType,
                            }];
                }
            });
        });
    };
    DrupalArticleProcessor.prototype.genDataFromSrc = function (src, relativeUri) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            return __generator(this, function (_a) {
                if (Drupal.isBase64(src)) {
                    return [2 /*return*/, this.parseBase64ImgSrc(src, relativeUri)];
                }
                return [2 /*return*/, this.parseUriImgSrc(src)];
            });
        });
    };
    /*
     * Article body processing methods
     */
    DrupalArticleProcessor.prototype.genProcessManagedToPublicFiles = function (htmlBody) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var managedFiles, newBody;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        managedFiles = htmlBody.match(/(\[{2}.+?fid.+?\]{2})/g);
                        newBody = htmlBody;
                        if (!(managedFiles != null)) return [3 /*break*/, 2];
                        return [4 /*yield*/, bluebird_1.default.each(managedFiles, function (fileObjStr) { return __awaiter(_this, void 0, void 0, function () {
                                var fileObj, repl;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            fileObj = JSON.parse(fileObjStr);
                                            return [4 /*yield*/, this.genManagedFileToHTMLTag(fileObj)];
                                        case 1:
                                            repl = _a.sent();
                                            newBody = newBody.replace(fileObjStr, repl);
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/, newBody];
                }
            });
        });
    };
    DrupalArticleProcessor.prototype.genProcessHTMLImageTags = function (htmlBody, relativeUri) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var $;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        $ = cheerio_1.default.load(htmlBody);
                        return [4 /*yield*/, bluebird_1.default.map($("img").toArray(), function (el) { return __awaiter(_this, void 0, void 0, function () {
                                var src, fullUri;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            src = $(el).attr("src");
                                            if (src.match(/cleardot.gif/gi)) {
                                                $(el).remove();
                                                return [2 /*return*/];
                                            }
                                            return [4 /*yield*/, this.drupalToDirectusImage(src, relativeUri)];
                                        case 1:
                                            fullUri = (_a.sent()).fullUri;
                                            if (fullUri == null) {
                                                return [2 /*return*/];
                                            }
                                            $(el).attr("src", fullUri);
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, $.html()];
                }
            });
        });
    };
    DrupalArticleProcessor.prototype.genProcessHTMLInlineFileTags = function (postData) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var res1, res2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.genProcessManagedToPublicFiles(postData.body)];
                    case 1:
                        res1 = _a.sent();
                        res2 = this.genProcessHTMLImageTags(res1, postData.relative_uri);
                        return [2 /*return*/, res2];
                }
            });
        });
    };
    return DrupalArticleProcessor;
}());
exports.DrupalArticleProcessor = DrupalArticleProcessor;
exports.default = Drupal;
//# sourceMappingURL=drupal.js.map