const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text, params) {
  return pool.query(text, params);
}

async function queryOne(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

async function queryAll(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

module.exports = { pool, query, queryOne, queryAll };
