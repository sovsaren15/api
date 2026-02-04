// config/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Asynchronously test the connection on startup
(async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('MySQL Database connected successfully!');
  } catch (error) {
    console.error('❌ Failed to connect to the MySQL database.');
    console.error(`Error: ${error.message}`);
    // Exit the process with a failure code if we can't connect to the DB.
    // The application is not functional without it.
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
})();

module.exports = pool;