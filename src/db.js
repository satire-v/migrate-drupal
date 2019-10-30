const mysql2 = require('mysql2/promise');

const dbOptions = {
  host: 'localhost',
  user: 'root',
  database: argv.db,
  password: argv.password,
};
