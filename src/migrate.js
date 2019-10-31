// @flow
const yargs = require("yargs");
const drupal = require("./drupal.js");
const mysql = require("./mysql.js");

//TODO: make interactive by default
const argv = yargs
  .option("db", {
    alias: "d",
    description: "The database to query from",
    type: "string"
  })
  .option("password", {
    alias: "p",
    description: "The password to the database to query from",
    type: "string"
  })
  .help()
  .alias("help", "h")
  .demandOption(
    ["db", "password"],
    "Please provide database name and password. Assumed to be running on localhost, user root, port 3306 (MySQL)"
  ).argv;

async function processAllInlineFiles(postData) {
  postData.body = await drupal.genProcessManagedToPublicFiles(postData.body);
  postData.body = await drupal.genProcessHTMLImageTags(
    postData.body,
    postData.relative_uri
  );
  console.log(postData.body);
  return postData;
}

async function main() {
  const db = mysql.newDB(argv.db, argv.password);
  const testArticles = await drupal.fetchFullDatabase(db);
  await processAllInlineFiles(testArticles[0]);
}

main();
