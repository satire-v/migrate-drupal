import mysql2, {
  Connection,
  RowDataPacket,
  OkPacket,
  FieldPacket,
  QueryOptions,
} from "mysql2/promise";

import logger from "../logger";
import args from "../args";

type QueryReponse = [
  RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[],
  FieldPacket[]
];

type QueryArgs =
  | [string]
  | [string, any | any[] | { [param: string]: any }]
  | [QueryOptions]
  | [QueryOptions, any | any[] | { [param: string]: any }];

class Database {
  private connection: Promise<Connection>;

  constructor() {
    this.connection = this.connect();
  }

  private async connect(): Promise<Connection> {
    try {
      return mysql2.createConnection({
        host: "localhost",
        user: "root",
        database: args.db,
        password: args.password,
      });
    } catch (e) {
      logger.error(e);
      throw e;
    }
  }

  public async query(args: QueryArgs): Promise<QueryReponse> {
    const db = await this.connection;
    return db.query.apply(null, args);
  }

  public async stop(): Promise<void> {
    const db = await this.connection;
    await db.end();
  }
}

const DB = new Database();

export default DB;
