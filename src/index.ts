/* eslint-disable @typescript-eslint/camelcase */
import yargs, { Options as OptionParams, PositionalOptionsType } from "yargs";
import inquirer, { ChoiceOptions, DistinctQuestion, Answers } from "inquirer";

import { exportFromDrupal, importToLocal, importToDirectus } from "./transfer";
import { convert } from "./convert";

export const DRUPAL_DATABASE = "satirevdrupal";
export const DIRECTUS_DATABASE = "satirev";
export const DIRECTUS_IMPORT_FILE = "directus_import.sql";

enum Options {
  "article_count",
  "concurrency",
  "drupal_pwd",
  "root_pwd",
  "mysql_pwd",
  "directus_pwd",
}

type Option = keyof typeof Options;

enum Commands {
  "import",
  "convert",
  "export",
  "transfer",
  "port",
}

type Command = keyof typeof Commands;

const co: Record<string, string[]> = {};
co["import"] = ["drupal_pwd", "root_pwd"];
co["convert"] = ["article_count", "concurrency", "mysql_pwd"];
co["export"] = ["directus_pwd"];
co["transfer"] = [...new Set([...co.convert, ...co.export])];
co["port"] = [...new Set([...co.import, ...co.convert, ...co.export])];

const commandOptions = co as Record<Command, Option[]>;

const optionCommands: Record<Option, Command[]> = Object.keys(Options).reduce(
  (acc, option) => {
    acc[option] = Object.keys(commandOptions).filter(key =>
      commandOptions[key].includes(option)
    );
    return acc;
  },
  {} as Record<Option, Command[]>
);

interface MyOptionParams
  extends Pick<OptionParams, "alias" | "default" | "description" | "type"> {
  alias: string | ReadonlyArray<string>;
  default: unknown;
  description: string;
  type: "array" | "count" | PositionalOptionsType;
}

const options: Record<Option, MyOptionParams> = {
  article_count: {
    alias: "n",
    description: "Number of articles to write to import",
    type: "number",
    default: undefined,
  },

  concurrency: {
    alias: "c",
    description: "Concurrency of asynchronous article processing",
    type: "number",
    default: 10,
  },

  drupal_pwd: {
    alias: ["drp", "dru_pwd"],
    description: "Drupal database password",
    type: "string",
    default: null,
  },

  root_pwd: {
    alias: "rp",
    description: "Root user password",
    type: "string",
    default: null,
  },

  mysql_pwd: {
    alias: "mp",
    description: "Local MySQL password",
    type: "string",
    default: null,
  },

  directus_pwd: {
    alias: ["dsp", "dir_pwd"],
    description: "Directus database password",
    type: "string",
    default: null,
  },
};

interface CommandParams {
  aliases: string[];
  desc: string;
  args: Record<Option, MyOptionParams>;
}

function getM2M<
  K extends Option | Command,
  BValues extends MyOptionParams | CommandParams,
  B extends Exclude<Option | Command, K>
>(key: K, map: Record<K, B[]>, values: Record<B, BValues>): Record<B, BValues> {
  return map[key].reduce((acc, bkey) => {
    acc[bkey] = values[bkey];
    return acc;
  }, {} as Record<B, BValues>);
}

const commands: Record<Command, CommandParams> = {
  transfer: {
    aliases: ["transfer", "$0"],
    desc: "Convert local db data to Directus format and export into Directus",
    args: getM2M("transfer", commandOptions, options),
  },
  port: {
    aliases: ["port", "full_port"],
    desc: "Full port of data: import from Drupal, convert, then export to Directus",
    args: getM2M("port", commandOptions, options),
  },
  import: {
    aliases: ["import", "drupal_import"],
    desc: "Import data from Drupal db to local db",
    args: getM2M("import", commandOptions, options),
  },
  convert: {
    aliases: ["convert", "parse"],
    desc:
      "Convert local db data to Directus format. **Does not export into Directus",
    args: getM2M("convert", commandOptions, options),
  },
  export: {
    aliases: ["export", "export_directus"],
    desc: "Export local SQL file to Directus",
    args: getM2M("export", commandOptions, options),
  },
};

async function main(): Promise<void> {
  Object.keys(commands).forEach((cKey: Command) => {
    yargs.command(
      commands[cKey].aliases,
      commands[cKey].desc,
      commands[cKey].args
    );
  });

  const { argv } = yargs.help().alias("help", "h");

  const optionQuestions: DistinctQuestion[] = Object.keys(options).map(
    (opKey: Option): DistinctQuestion => {
      const type = opKey.includes("pwd")
        ? "password"
        : options[opKey].type === "number"
        ? "number"
        : "input";
      return {
        name: opKey,
        message: options[opKey].description,
        type,
        mask: type === "password" ? "*" : undefined,
        when: (answers: Answers): boolean => {
          if (optionCommands[opKey].includes(answers.command) && !argv[opKey]) {
            return true;
          }
          answers[opKey] = argv[opKey];
          return false;
        },
      };
    }
  );

  const answers = await inquirer.prompt([
    ...optionQuestions,
    {
      name: "command",
      message: "What do you want to do?",
      type: "list",
      choices: Object.keys(commands).map(
        (cKey: Command): ChoiceOptions => {
          return {
            name: `${cKey}: ${commands[cKey].desc}`,
            value: cKey,
            short: cKey.charAt(0).toUpperCase() + cKey.slice(1),
          };
        }
      ),
      when: (answers: Answers): boolean => {
        if (argv._.length !== 0) {
          answers.command = argv._[0];
          return false;
        }
        return true;
      },
    },
  ]);

  switch (answers.command as Command) {
    case "import":
      await exportFromDrupal(answers.drupal_pwd);
      await importToLocal(answers.root_pwd, answers.mysql_pwd);
      break;
    case "convert":
      await convert(
        answers.article_count,
        answers.concurrency,
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
        answers.article_count,
        answers.concurrency,
        answers.mysql_pwd
      );
      await importToDirectus(answers.directus_pwd);
      break;
    case "transfer":
    default:
      await convert(
        answers.article_count,
        answers.concurrency,
        answers.mysql_pwd
      );
      await importToDirectus(answers.directus_pwd);
      break;
  }
}

main();
