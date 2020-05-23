import yargs from "yargs";

const { argv } = yargs
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
    default: undefined,
  })
  .option("concurrency", {
    alias: "c",
    description: "Concurrency of article processing",
    type: "number",
    default: 10,
  })
  .help()
  .alias("help", "h")
  .demandOption(
    ["password"],
    "Please provide database password. Assumed to be running on localhost, user root, port 3306 (MySQL)"
  );

export default argv;
