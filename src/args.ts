/* eslint-disable @typescript-eslint/camelcase */
import yargs from "yargs";
import inquirer from "inquirer";

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
  drupal_pwd: {
    drupal_pwd: {
      alias: ["drp", "dru_pwd"],
      description: "Drupal database password",
      type: "string",
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

inquirer
  .prompt([
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
        return (com === "port" || com === "import") && !argv.drupal_pwd;
      },
    },
    {
      name: "mysql_pwd",
      message: "Local MySQL password:",
      type: "password",
      mask: "*",
      when: (answers): boolean => {
        const com = answers.command;
        return com !== "export" && !argv.mysql_pwd;
      },
    },
    {
      name: "directus_pwd",
      message: "Directus database password:",
      type: "password",
      mask: "*",
      when: (answers): boolean => {
        const com = answers.command;
        return (
          (com === "port" || com === "transfer" || com === "export") &&
          !argv.directus_pwd
        );
      },
    },
  ])
  .then(answers => {
    console.log(answers);
  });

export default argv;
