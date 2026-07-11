const pg = require('pg');

// Configure pg engine defaults before initialization
pg.defaults.ssl = { rejectUnauthorized: false };
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(async () => {
    console.log('✅ Connected to PostgreSQL database');
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
    } catch (indexErr) {
      console.error('⚠️ Index verification warning:', indexErr.message);
    }
  })
  .catch(err => console.error('❌ DB connection error:', err));

module.exports = pool;