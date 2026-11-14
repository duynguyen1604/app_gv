import pkg from 'pg'
const { Pool } = pkg

const connectionString = process.env.DATABASE_URL

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl:
          connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
            ? false
            : { rejectUnauthorized: false },
        max: 10,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'app_gv',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 10,
      }
)

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err)
})

export default pool

