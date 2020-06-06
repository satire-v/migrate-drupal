/* eslint-disable @typescript-eslint/camelcase */
import yargs from "yargs";
import inquirer from "inquirer";

import { exportFromDrupal, importToLocal, importToDirectus } from "./transfer";
import { convert } from "./convert";

export const DRUPAL_DATABASE = "satirevdrupal";
export const DIRECTUS_DATABASE = "satirev";
export const DIRECTUS_IMPORT_FILE = "directus_import.sql";

const options: Record<string, Record<string, Record<string, any>>> = {
  articleCount: {
    articleCount: {
      alias: "n",
      description: "Number of articles to write to import",
      type: "number",
      default: undefined,
    },
  },
  concurrency: {
    concurrency: {
      alias: "c",
      description: "Concurrency of article processing",
      type: "number",
      default: 10,
    },
  },
  drupal_pwd: {
    drupal_pwd: {
      alias: ["drp", "dru_pwd"],
      description: "Drupal database password",
      type: "string",
      default: null,
    },
  },
  root_pwd: {
    root_pwd: {
      alias: "rp",
      description: "Root user password",
      type: "string",
      default: null,
    },
  },
  mysql_pwd: {
    mysql_pwd: {
      alias: "mp",
      description: "Local MySQL password",
      type: "string",
      default: null,
    },
  },
  directus_pwd: {
    directus_pwd: {
      alias: ["dsp", "dir_pwd"],
      description: "Directus database password",
      type: "password",
      default: null,
    },
  },
};

const commands = [
  {
    name: "transfer",
    aliases: ["transfer", "$0"],
    desc: "Convert local db data to Directus format and export into Directus",
    args: {
      ...options.mysql_pwd,
      ...options.articleCount,
      ...options.concurrency,
      ...options.directus_pwd,
    },
    short: "Transfer",
  },
  {
    name: "port",
    aliases: ["port", "full_port"],
    desc: "Full port of data: import from Drupal and export to Directus",
    args: {
      ...options.drupal_pwd,
      ...options.root_pwd,
      ...options.mysql_pwd,
      ...options.articleCount,
      ...options.concurrency,
      ...options.directus_pwd,
    },
    short: "Port",
  },
  {
    name: "import",
    aliases: ["import", "drupal_import"],
    desc: "Import data from Drupal db to local db",
    args: {
      ...options.root_pwd,
      ...options.drupal_pwd,
      ...options.mysql_pwd,
    },
    short: "Import",
  },
  {
    name: "convert",
    aliases: ["convert", "parse"],
    desc:
      "Convert local db data to Directus format. **Does not export into Directus",
    args: {
      ...options.mysql_pwd,
      ...options.articleCount,
      ...options.concurrency,
    },
    short: "Convert",
  },
  {
    name: "export",
    aliases: ["export", "export_directus"],
    desc: "Export local SQL file to Directus",
    args: {
      ...options.directus_pwd,
    },
    short: "Export",
  },
];

commands.forEach(command => {
  yargs.command(command.aliases, command.desc, command.args);
});

const { argv } = yargs.help().alias("help", "h");

async function main(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      name: "command",
      message: "What do you want to do?",
      type: "list",
      choices: commands.map(command => {
        return {
          name: `${command.name}: ${command.desc}`,
          value: command.name,
          short: command.short,
        };
      }),
      when: (answers): boolean => {
        if (argv._.length !== 0) {
          answers.command = argv._[0];
          return false;
        }
        return true;
      },
    },
    {
      name: "drupal_pwd",
      message: "Drupal database password:",
      type: "password",
      mask: "*",
      when: (answers): boolean => {
        const com = answers.command;
        if (com === "port" || (com === "import" && !argv.drupal_pwd)) {
          return true;
        }
        answers.drupal_pwd = argv.drupal_pwd;
        return false;
      },
    },
    {
      name: "root_pwd",
      message: "Root user password:",
      type: "password",
      mask: "*",
      when: (answers): boolean => {
        const com = answers.command;
        if ((com === "port" || com === "import") && !argv.root_pwd) {
          return true;
        }
        answers.root_pwd = argv.root_pwd;
        return false;
      },
    },
    {
      name: "mysql_pwd",
      message: "Local MySQL password:",
      type: "password",
      mask: "*",
      when: (answers): boolean => {
        const com = answers.command;
        if (com !== "export" && !argv.mysql_pwd) {
          return true;
        }
        answers.mysql_pwd = argv.mysql_pwd;
        return false;
      },
    },
    {
      name: "directus_pwd",
      message: "Directus database password:",
      type: "password",
      mask: "*",
      when: (answers): boolean => {
        const com = answers.command;
        if (
          (com === "port" || com === "transfer" || com === "export") &&
          !argv.directus_pwd
        ) {
          return true;
        }
        answers.directus_pwd = argv.directus_pwd;
        return false;
      },
    },
  ]);

  switch (answers.command) {
    case "import":
      await exportFromDrupal(answers.drupal_pwd);
      await importToLocal(answers.root_pwd, answers.mysql_pwd);
      break;
    case "convert":
      await convert(
        argv.articleCount as number,
        argv.concurrency as number,
        answers.mysql_pwd
      );
      break;
    case "export":
      await importToDirectus(answers.directus_pwd);
      break;
    case "port":
      await exportFromDrupal(answers.drupal_pwd);
      await importToLocal(answers.root_pwd, answers.mysql_pwd);
      await convert(
        argv.articleCount as number,
        argv.concurrency as number,
        answers.mysql_pwd
      );
      await importToDirectus(answers.directus_pwd);
      break;
    case "transfer":
    default:
      await convert(
        argv.articleCount as number,
        argv.concurrency as number,
        answers.mysql_pwd
      );
      await importToDirectus(answers.directus_pwd);
      break;
  }
}

main();
