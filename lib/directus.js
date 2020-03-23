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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/camelcase */
var slug_1 = __importDefault(require("slug"));
// slugifying library. same as Directus, I believe
// yes, i'm using both
var request_promise_1 = __importDefault(require("request-promise"));
var mysql2_1 = __importDefault(require("mysql2"));
var bluebird_1 = __importDefault(require("bluebird"));
// Directus main class
var Directus = /** @class */ (function () {
    function Directus(drupal) {
        this.drupal = drupal; // instance of a drupal object/module/class
        /* uploadImage lives here because it has to do solely with directus,
        but the Drupal object needs to be able to call the function from itself
        so that the async/progress bar setup works  */
        this.drupal.setUploadFn(this.uploadImage.bind(this));
    }
    /* This just fetches the ID of every single image in directus,
    so we can delete them all in one go. Should be a better way to do this, but for security
    Directus doesn't allow batch delete, a reasonable precaution */
    Directus.getImageIds = function () {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var options, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        options = {
                            method: "get",
                            // hardcoded url
                            url: "http://api.satirev.org/satire-v/files",
                            project: "satire-v",
                            auth: {
                                // static auth token
                                bearer: "letmeinyoubitch",
                            },
                            qs: {
                                fields: "id",
                            },
                        };
                        _b = (_a = JSON).parse;
                        return [4 /*yield*/, request_promise_1.default.get(options)];
                    case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                }
            });
        });
    };
    /* deletes all the images for a clean migration from drupal */
    Directus.deleteImages = function (ids) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var options;
            return __generator(this, function (_a) {
                options = {
                    method: "delete",
                    url: "http://api.satirev.org/satire-v/files/" + ids
                        .map(function (e) { return e.id; })
                        .join(","),
                    project: "satire-v",
                    auth: {
                        // static auth token
                        bearer: "letmeinyoubitch",
                    },
                };
                return [2 /*return*/, request_promise_1.default.delete(options)];
            });
        });
    };
    /* A fairly dumb function in that it just gets the data and uploads it.
    The parsing is done elsewhere */
    Directus.prototype.uploadImage = function (
    /* request.Request is essentially a readble stream with some extra features,
    and both that and buffer work just fine with the api */
    fileData, fileName, fileMimeType) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var options, content;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        options = {
                            method: "post",
                            // hardcoded url
                            url: "http://api.satirev.org/satire-v/files",
                            project: "satire-v",
                            auth: {
                                // static auth token
                                bearer: "letmeinyoubitch",
                            },
                            timeout: this.drupal.fileTimeout,
                            time: true,
                            // Formdata format is the most reliable way to have the request processed correctly
                            formData: {
                                filename_disk: fileName,
                                filename_download: fileName,
                                data: {
                                    value: fileData,
                                    options: {
                                        filename: fileName,
                                        contentType: fileMimeType,
                                    },
                                },
                            },
                        };
                        /* Logging, or trying to. Should probably use an actual debugging library,
                        but this was sort of paperclips and gum while I needed some info easily  */
                        this.drupal.fileDebugStream.write("Trying to upload " + fileName + "\n");
                        return [4 /*yield*/, request_promise_1.default
                                .post(options)
                                .catch(function (err) {
                                /* When this catch fires, I think, there isn't "Formdata: ..." in the err message
                                When that shoes up, I believe it's thrown from the download function */
                                throw new Error("Failed uploading " + fileName + ": " + err);
                            })
                                .then(function (res) {
                                _this.drupal.fileDebugStream.write("Succeeded in uploading " + fileName + "\n");
                                return JSON.parse(res);
                            })];
                    case 1:
                        content = _a.sent();
                        // Return the url for img tags
                        // Return id for database linking (featured image)
                        // Return name for convenience and safety (sometimes there are namespace conflicts)
                        return [2 /*return*/, {
                                fullUri: content.data.data.full_url,
                                fileName: fileName,
                                imageID: content.data.id,
                            }];
                }
            });
        });
    };
    /* Fetches categories from Drupal database copy,
    and creates SQL query to insert them in Directus */
    Directus.createCategoriesImport = function (categoryMap) {
        // Start with a clean slate
        var query = "DELETE FROM categories;\nINSERT INTO categories (`name`,`slug`, id) VALUES";
        var queryArray = [];
        // SQL value entries are surrounded by parentheses, separated by commas
        Object.keys(categoryMap).forEach(function (key) {
            queryArray.push("('" + key + "', '" + slug_1.default(key) + "', " + categoryMap[key] + ")");
        });
        query += queryArray.join(",") + ";\n";
        return query;
    };
    // SQL dates are formatted slightly differently than unix
    Directus.unixToSQLDate = function (unixts) {
        return new Date(unixts * 1000)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");
    };
    /* Just the beginning of the query. I wish there was some way to type check this
    field order but for now I just try to locate it close by */
    Directus.insertArticleStart = function () {
        return "INSERT INTO articles (\n    `status`,\n    created_by,\n    modified_by,\n    created_on,\n    modified_on,\n    title,\n    body,\n    tags,\n    featured_image,\n    featured_image_caption,\n    excerpt,\n    category,\n    slug,\n    legacy_slug\n  )\n  VALUES ";
    };
    /* The big one. Creates the SQL query to insert an article, all of the fields */
    Directus.prototype.createArticleImportQuery = function (article, categoryMap) {
        return __awaiter(this, void 0, bluebird_1.default, function () {
            var drupalArticleProcessor, pub, created, changed, title, tags, caption, teaser, categoryID, newSlug, legacySlug, imageID, body, _a, _b, values;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        drupalArticleProcessor = this.drupal.newArticleProcessor();
                        pub = article.status ? "published" : "draft";
                        created = Directus.unixToSQLDate(article.created);
                        changed = Directus.unixToSQLDate(article.changed);
                        title = mysql2_1.default.escape(article.title);
                        tags = mysql2_1.default.escape(article.tags_info);
                        caption = mysql2_1.default.escape(article.caption);
                        teaser = mysql2_1.default.escape(article.teaser);
                        categoryID = categoryMap[article.category_name];
                        // I got rid of these manually on the Drupal site, but just in case
                        if (categoryID == null) {
                            categoryID = categoryMap["Everything Else"];
                        }
                        newSlug = slug_1.default(article.title, {
                            lower: true,
                        });
                        legacySlug = mysql2_1.default.escape(article.relative_uri);
                        return [4 /*yield*/, drupalArticleProcessor.drupalToDirectusImage(article.image_uri, article.relative_uri)];
                    case 1:
                        imageID = (_c.sent()).imageID;
                        _b = (_a = mysql2_1.default).escape;
                        return [4 /*yield*/, drupalArticleProcessor.genProcessHTMLInlineFileTags(article)];
                    case 2:
                        body = _b.apply(_a, [_c.sent()]);
                        values = "('" + pub + "', 1, 1, '" + created + "', '" + changed + "', " + title + ", " + body + ", " + tags + ", " + imageID + ", " + caption + ", " + teaser + ", " + categoryID + ", '" + newSlug + "', " + legacySlug + ")";
                        // Done with this article's processing
                        this.drupal.incrementArticleBar();
                        return [2 /*return*/, values];
                }
            });
        });
    };
    return Directus;
}());
exports.default = Directus;
//# sourceMappingURL=directus.js.map