/* eslint-disable @typescript-eslint/camelcase */
import os from "os";
import child_process from "child_process";

import SSH from "node-ssh";
import inquirer from "inquirer";
import retry from "bluebird-retry";

import * as utils from "./utils";
import logger from "./logger";

const DRUPAL_DATABASE = "satirevdrupal";
const DIRECTUS_DATABASE = "satirev";
const DIRECTUS_IMPORT_FILE = "directus_import.sql";

export async function exportFromDrupal(): Promise<void> {
  const ssh = new SSH();
  logger.info("Attempting to connect to Drupal server...");

  // Because GoDaddy's shared servers are... very bad
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

  const { password } = await inquirer.prompt([
    {
      type: "password",
      name: "password",
      mask: "*",
      message: "Drupal database password: ",
    },
  ]);

  logger.info("Attempting to fetch Drupal database dump...");

  const returns = await ssh.execCommand(
    `mysqldump -p${password} -h satirevdrupal.db.9044516.hostedresource.com -u satirevdrupal ${DRUPAL_DATABASE} node field_data_body field_data_field_caption field_data_field_category taxonomy_term_data taxonomy_vocabulary field_data_field_teaser field_data_field_year field_data_field_tags field_data_field_image file_managed url_alias > ${DRUPAL_DATABASE}.sql;`,
    { cwd: "./" }
  );
  utils.handleShellReturn(returns);

  logger.info("Database dumped...");

  // again... GoDaddy sux
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

export async function importToLocal(): Promise<void> {
  logger.info("Attempting to start locally running MySQL server as root...");
  const { rootPassword } = await inquirer.prompt({
    type: "password",
    message: "Sudo Root password: ",
    name: "rootPassword",
    mask: "*",
  });
  if (
    child_process.spawnSync(
      `echo '${rootPassword}' | sudo -S /usr/local/mysql/support-files/mysql.server status;`,
      { shell: true, stdio: "inherit", encoding: "utf-8" }
    ).status !== 0
  ) {
    child_process.spawnSync(
      `echo '${rootPassword}' | sudo -S /usr/local/mysql/support-files/mysql.server start;`,
      { shell: true, stdio: "inherit", encoding: "utf-8" }
    );
  }

  logger.info("Dropping current database, creating new one...");
  const answers = await inquirer.prompt([
    {
      type: "password",
      message: "Local MySQL password: ",
      name: "password",
      mask: "*",
    },
  ]);

  const localPwd = answers.password;

  let returns = child_process.spawnSync(
    `mysql -u root -p${localPwd} -e 'DROP SCHEMA IF EXISTS ${DRUPAL_DATABASE}; CREATE DATABASE ${DRUPAL_DATABASE}'`,
    [],
    { shell: true, stdio: ["inherit", "inherit", "pipe"], encoding: "utf-8" }
  );
  utils.handleShellReturn(returns);

  returns = child_process.spawnSync(
    `mysql -u root -p${localPwd} ${DRUPAL_DATABASE}<${DRUPAL_DATABASE}.sql`,
    [],
    { shell: true, stdio: ["inherit", "inherit", "pipe"], encoding: "utf-8" }
  );
  utils.handleShellReturn(returns);

  logger.info("Drupal database imported locally...");
}

export async function importToDirectus(): Promise<void> {
  const { directusPassword } = await inquirer.prompt([
    {
      type: "password",
      message: "Directus database password: ",
      name: "directusPassword",
      mask: "*",
    },
  ]);
  logger.info("Copying import to server...");

  const ssh = new SSH();
  await ssh.connect({
    host: "138.197.226.172",
    username: "jacob",
    privateKey: os.homedir() + "/.ssh/id_rsa",
  });
  await ssh.putFile(`../${DIRECTUS_IMPORT_FILE}`, `${DIRECTUS_IMPORT_FILE}`);
  const returns = await ssh.execCommand(
    `mysql -p${directusPassword} -h localhost -u satirev ${DIRECTUS_DATABASE} < ${DIRECTUS_IMPORT_FILE}`
  );
  utils.handleShellReturn(returns);
}
