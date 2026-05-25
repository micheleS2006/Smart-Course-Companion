// config/db.js – MySQL connection pool
// Usage: const db = require('../config/db');
//        const [rows] = await db.query('SELECT ...', [params]);

require('dotenv').config({ path: require('path').join(__dirname, '../config/.env') });
const mysql = require('mysql2');

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

// .promise() lets us use async/await instead of callbacks
module.exports = pool.promise();
