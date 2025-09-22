// server/db.ts
import 'dotenv/config';

import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from 'ws';
import * as schema from '@shared/schema';

type PgPoolType = Pool;

// Ensure the env variable is set
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL must be set. Did you forget to provision a database?',
  );
}

const databaseHost = new URL(connectionString).hostname;
const isLocalConnection =
  databaseHost === 'localhost' ||
  databaseHost === '127.0.0.1' ||
  databaseHost === '::1';

let pool: NeonPool | PgPoolType;

if (isLocalConnection) {
  pool = new Pool({ connectionString });
} else {
  // Configure Neon to use WebSocket when connecting to Neon-hosted databases
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString });
}

export { pool };

// Initialize Drizzle with the appropriate driver for the pool
export const db = isLocalConnection
  ? drizzlePg(pool as PgPoolType, { schema })
  : drizzleNeon({ client: pool as NeonPool, schema });
