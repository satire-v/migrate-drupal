// @flow
// const s3 = require('s3');
import type { Obj } from './utils';

const mysql2 = require('mysql2/promise');


// function getAWSClient() {
//   return s3.createClient({
//     s3Options: {
//       accessKeyId: 'AKIAR6GW3CSFY5C7D3I3',
//       secretAccessKey: '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',
//     },
//   });
// }

const newLocalDB = (dbName: string, password: string): Promise<Obj> => mysql2.createConnection({
  host: 'localhost',
  user: 'root',
  database: dbName,
  password,
});


module.exports = { newLocalDB };
