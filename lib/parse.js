
const yargs = require("yargs");
const drupal = require("./drupal.js");
const mysql = require("./mysql.js");


const argv = yargs.
option("db", {
  alias: "d",
  description: "The local database to query from",
  type: "string",
  default: "satirevdrupal" }).

option("password", {
  alias: "p",
  description: "The password to the local database",
  type: "string" }).

help().
alias("help", "h").
demandOption(
["password"],
"Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)").
argv;

async function processAllInlineFiles(postData, db) {
  const res1 = await drupal.genProcessManagedToPublicFiles(postData.body, db);
  const res2 = await drupal.genProcessHTMLImageTags(
  res1,
  postData.relative_uri);

  postData.body = res2;
  console.log(postData.body);
  return postData;
}

async function main() {
  const db = await mysql.newDB(argv.db, argv.password);
  const testArticles = await drupal.fetchFullDatabase(db);
  await processAllInlineFiles(testArticles[0], db);
}

main();