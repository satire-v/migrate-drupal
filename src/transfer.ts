/* eslint-disable @typescript-eslint/camelcase */
import { Readable } from "stream";
import os from "os";
import child_process from "child_process";

import db from "./database";

import Prompt from "prompt-sync";
import SSH from "node-ssh";
import retry from "bluebird-retry";
import { promisify } from "bluebird";
const exec = promisify(child_process.exec);

import logger from "./logger";

const DRUPAL_DATABASE = "satirevdrupal";
const DIRECTUS_DATABASE = "satirev";

const prompt = Prompt();

async function exportDrupal(): Promise<void> {
  const ssh = new SSH();
  logger.info("Attempting to connect to Drupal server...");
  await retry(
    async () =>
      await ssh.connect({
        host: "50.63.72.1",
        username: "satirev",
        privateKey: os.homedir() + "/.ssh/id_rsa",
        algorithms: {
          serverHostKey: ["ssh-rsa", "ssh-dss"],
        },
      }),
    {
      throw_original: true,
      max_tries: 10,
    }
  );
  logger.info("Connected...");
  const drupalPwd = prompt.hide("Drupal database password: ");
  logger.info("Attempting to fetch Drupal database dump...");
  const result = await ssh.execCommand(
    `mysqldump -p${drupalPwd} -h satirevdrupal.db.9044516.hostedresource.com -u satirevdrupal ${DRUPAL_DATABASE} node field_data_body field_data_field_caption field_data_field_category taxonomy_term_data taxonomy_vocabulary field_data_field_teaser field_data_field_year field_data_field_tags field_data_field_image file_managed url_alias > ${DRUPAL_DATABASE}.sql;`,
    { cwd: "./" }
  );
  if (result.stderr) {
    logger.error(result.stderr);
    throw new Error(result.stderr);
  }
  logger.info("Database dumped...");
  await retry(
    async () =>
      await ssh.getFile(`../${DRUPAL_DATABASE}.sql`, `${DRUPAL_DATABASE}.sql`),
    {
      throw_original: true,
      max_tries: 10,
    }
  );
  logger.info("Database copied to local directory...");
  ssh.dispose();
}

async function importLocal(): Promise<void> {
  logger.info("Attempting to start locally running MySQL server as root");
  // await exec("sudo /usr/local/mysql/support-files/mysql.server start");

  logger.info("Dropping current database, creating new one");
  const localPwd = "mysqlmysql";
  // prompt.hide("Local MySQL password: ");

  const ls = child_process.spawn(
    `mysql`,
    [
      "-u",
      "root",
      "-p",
      "-e",
      `'DROP SCHEMA IF EXISTS ${DRUPAL_DATABASE}; CREATE DATABASE ${DRUPAL_DATABASE}'`,
    ],
    {}
  );

  ls.stdout.on("data", data => {
    console.log(`stdout: ${data}`);
  });

  ls.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
  });

  ls.on("close", code => {
    console.log(`child process exited with code ${code}`);
  });
  // shell.stdout?.on("data", data => {
  //   if (data === "Enter password:") {
  //     shell.stdin?.write(localPwd + "\n");
  //   }
  // });
  // shell.on("close", () => {
  //   shell.stdin?.end();
  // });

  // child_process.spawnSync(
  //   `mysql -u root -p${localPwd} ${DRUPAL_DATABASE}<${DRUPAL_DATABASE}.sql`,
  //   [],
  //   { stdio: "inherit", shell: true }
  // );
}

async function main(): Promise<void> {
  //await exportDrupal();
  await importLocal();
}

main();
