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
var fs_1 = __importDefault(require("fs"));
var yargs_1 = __importDefault(require("yargs"));
var bluebird_1 = __importDefault(require("bluebird"));
var drupal_1 = __importDefault(require("./drupal"));
var directus_1 = __importDefault(require("./directus"));
var database_1 = __importDefault(require("./database"));
var argv = yargs_1.default
    .option("db", {
    alias: "d",
    description: "The local database to query from",
    type: "string",
    default: "satirevdrupal",
})
    .option("password", {
    alias: "p",
    description: "The password to the local database",
    type: "string",
})
    .option("articleCount", {
    alias: "n",
    description: "Number of articles to write to import",
    type: "number",
    default: 0,
})
    .help()
    .alias("help", "h")
    .demandOption(["password"], "Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)").argv;
var getDrupal = function (drupal) {
    return drupal.genAllArticles();
};
function main() {
    var _a;
    return __awaiter(this, void 0, bluebird_1.default, function () {
        var db, drupal, directus, categoryMap, catQuery, deleteArticles, ids, articles, articlesToGet, articlesProcessed, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, database_1.default.newLocalDB(argv.db, argv.password)];
                case 1:
                    db = _e.sent();
                    drupal = new drupal_1.default(db, true);
                    directus = new directus_1.default(drupal);
                    return [4 /*yield*/, drupal.genDrupalCategoriesMap()];
                case 2:
                    categoryMap = _e.sent();
                    catQuery = directus_1.default.createCategoriesImport(categoryMap);
                    deleteArticles = "DELETE FROM articles;\n";
                    return [4 /*yield*/, directus_1.default.getImageIds()];
                case 3:
                    ids = _e.sent();
                    if (!(ids.data.length !== 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, directus_1.default.deleteImages(ids.data)];
                case 4:
                    _e.sent();
                    _e.label = 5;
                case 5:
                    drupal.fileDebugStream.write("Deleted existing images\n");
                    return [4 /*yield*/, getDrupal(drupal)];
                case 6:
                    articles = _e.sent();
                    drupal.createArticleProgressBar((_a = argv.articleCount) !== null && _a !== void 0 ? _a : articles.length);
                    drupal.createFilesProgressBar();
                    articlesToGet = argv.articleCount
                        ? articles.slice(0, argv.articleCount)
                        : articles;
                    return [4 /*yield*/, bluebird_1.default.map(articlesToGet, function (article) { return directus.createArticleImportQuery(article, categoryMap); }, { concurrency: 0 })];
                case 7:
                    articlesProcessed = _e.sent();
                    _c = (_b = fs_1.default).writeFile;
                    _d = ["import.sql"];
                    return [4 /*yield*/, catQuery];
                case 8:
                    _c.apply(_b, _d.concat([(_e.sent()) +
                            deleteArticles +
                            directus_1.default.insertArticleStart() +
                            articlesProcessed.join(",") + ";",
                        function (err) {
                            if (err)
                                throw err;
                        }]));
                    drupal.fileDebugStream.end("DONE");
                    drupal.stopMultibar();
                    return [4 /*yield*/, drupal.stopDB()];
                case 9:
                    _e.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main();
//# sourceMappingURL=parse.js.map