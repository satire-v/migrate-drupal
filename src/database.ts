import mysql2 from "mysql2/promise";

import args from "./args";

const pool = mysql2.createPool({
  host: "localhost",
  user: "root",
  database: args.db,
  password: args.password,
  connectionLimit: 10,
});

export default pool;
