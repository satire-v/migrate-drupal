"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var promise_1 = __importDefault(require("mysql2/promise"));
/* This is for if you want to connect to S3 directly,
   but it's probably better to do so through Directus */
// const s3 = require('s3');
// function getAWSClient() {
//   return s3.createClient({
//     s3Options: {
//       accessKeyId: 'AKIAR6GW3CSFY5C7D3I3',
//       secretAccessKey: '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',
//     },
//   });
// }
// Just a utility function to setup a DB connection to localhost (gotta have MySQL installed)
exports.newLocalDB = function (dbName, password) {
    return promise_1.default.createConnection({
        host: "localhost",
        user: "root",
        database: dbName,
        password: password,
    });
};
exports.default = { newLocalDB: exports.newLocalDB };
//# sourceMappingURL=database.js.map