// server/db.ts
import 'dotenv/config';

import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import pg from 'pg';
import type { Pool as PgPoolType } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import ws from 'ws';
import * as schema from '@shared/schema';

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

const { Pool: PgPool } = pg;

let pool: NeonPool | PgPoolType;

if (isLocalConnection) {
  pool = new PgPool({ connectionString });
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
