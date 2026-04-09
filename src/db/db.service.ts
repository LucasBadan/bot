import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config(); // ← ADICIONA ISSO

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'OK' : 'NOT FOUND');
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool: Pool;
  public readonly db: NodePgDatabase<typeof schema>;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined');
    }

    this.pool = new Pool({
      connectionString,
    });

    this.db = drizzle(this.pool, {
      schema,
      logger: true,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
