import pg from 'pg';

let pool: pg.Pool | null = null;

export async function initPool(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  pool = new pg.Pool({
    connectionString,
    // Neon and most managed Postgres providers require SSL
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
  });
  // Sanity check
  await pool.query('SELECT 1');
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('db pool not initialized');
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params as any);
}
