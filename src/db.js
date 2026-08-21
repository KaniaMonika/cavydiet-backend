const mysql = require('mysql2/promise');

require('dotenv').config();

const ssl = process.env.DB_CA_CERT
  ? {
      ca: process.env.DB_CA_CERT.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
    }
  : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,

  ssl,

  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;