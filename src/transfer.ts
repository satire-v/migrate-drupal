/* eslint-disable @typescript-eslint/camelcase */
import os from "os";
import child_process from "child_process";

import SSH from "node-ssh";
import retry from "bluebird-retry";

import * as utils from "./utils";
import logger from "./logger";

import {
  DRUPAL_DATABASE,
  DIRECTUS_DATABASE,
  DIRECTUS_IMPORT_FILE,
} from "./index";

export async function exportFromDrupal(drpualPwd: string): Promise<void> {
  logger.info("EXPORT FROM DRUPAL\n");
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

  logger.info("Attempting to fetch Drupal database dump...");

  const returns = await ssh.execCommand(
    `mysqldump -p${drpualPwd} -h satirevdrupal.db.9044516.hostedresource.com -u satirevdrupal ${DRUPAL_DATABASE} node field_data_body field_data_field_caption field_data_field_category taxonomy_term_data taxonomy_vocabulary field_data_field_teaser field_data_field_year field_data_field_tags field_data_field_image file_managed url_alias > ${DRUPAL_DATABASE}.sql;`,
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
  logger.info("DONE EXPORTING FROM DRUPAL\n");
}

export async function importToLocal(
  rootPwd: string,
  mysqlPwd: string
): Promise<void> {
  logger.info("IMPORT TO LOCAL\n");

  logger.info("Attempting to start locally running MySQL server as root...");

  if (
    child_process.spawnSync(
      `echo '${rootPwd}' | sudo -S /usr/local/mysql/support-files/mysql.server status;`,
      { shell: true, stdio: "inherit", encoding: "utf-8" }
    ).status !== 0
  ) {
    child_process.spawnSync(
      `echo '${rootPwd}' | sudo -S /usr/local/mysql/support-files/mysql.server start;`,
      { shell: true, stdio: "inherit", encoding: "utf-8" }
    );
  }

  logger.info("Dropping current database, creating new one...");

  let returns = child_process.spawnSync(
    `mysql -u root -p${mysqlPwd} -e 'DROP SCHEMA IF EXISTS ${DRUPAL_DATABASE}; CREATE DATABASE ${DRUPAL_DATABASE}'`,
    [],
    { shell: true, stdio: ["inherit", "inherit", "pipe"], encoding: "utf-8" }
  );
  utils.handleShellReturn(returns);

  returns = child_process.spawnSync(
    `mysql -u root -p${mysqlPwd} ${DRUPAL_DATABASE}<${DRUPAL_DATABASE}.sql`,
    [],
    { shell: true, stdio: ["inherit", "inherit", "pipe"], encoding: "utf-8" }
  );
  utils.handleShellReturn(returns);

  logger.info("Drupal database imported locally...");
  logger.info("DONE IMPORTING TO LOCAL\n");
}

export async function importToDirectus(directusPwd: string): Promise<void> {
  logger.info("IMPORT TO DIRECTUS\n");

  logger.info("Copying import to server...");

  const ssh = new SSH();
  await ssh.connect({
    host: "138.197.226.172",
    username: "jacob",
    privateKey: os.homedir() + "/.ssh/id_rsa",
  });
  await ssh.putFile(`../${DIRECTUS_IMPORT_FILE}`, `${DIRECTUS_IMPORT_FILE}`);
  const returns = await ssh.execCommand(
    `mysql -p${directusPwd} -h localhost -u satirev ${DIRECTUS_DATABASE} < ${DIRECTUS_IMPORT_FILE}`
  );
  utils.handleShellReturn(returns);
  logger.info("DONE IMPORTING TO DIRECTUS\n");
}
