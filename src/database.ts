import mysql2, { Connection } from "mysql2/promise";

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
export const newLocalDB = (
  dbName: string,
  password: string
): Promise<Connection> => {
  try {
    const db = mysql2.createConnection({
      host: "localhost",
      user: "root",
      database: dbName,
      password,
    });
    return db;
  } catch (e) {
    console.log("Could not connect to database");
    throw new Error(e);
  }
};

export default { newLocalDB };
