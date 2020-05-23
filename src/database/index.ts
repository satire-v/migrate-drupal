import winston, { Logger } from "winston";
import mysql2, { Connection } from "mysql2/promise";

class DB {
  private connection?: Connection;
  private logger: Logger;

  constructor() {
    this.logger = winston.loggers.get("logger");
  }

  public async connect(dbName: string, password: string): Promise<void> {
    try {
      this.connection = await mysql2.createConnection({
        host: "localhost",
        user: "root",
        database: dbName,
        password,
      });
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  get db(): Connection {
    if (!this.connection) throw Error("No database connection established");
    return this.connection;
  }
}

export default new DB();
