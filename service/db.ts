import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, gte, sql } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import schema from './schema.ts';

export type Database = DrizzleD1Database<typeof schema>;
export type D1Binding = Parameters<typeof drizzle>[0];
export type DatabaseBatchStatement = Parameters<Database['batch']>[0][number];

const databaseBatchSize = 500;
const store = new AsyncLocalStorage<Database>();

export const createDb = (binding: D1Binding): Database => drizzle(binding, { schema });

export const withDatabase = <Value>(binding: D1Binding, callback: () => Value): Value =>
  store.run(createDb(binding), callback);

export const runDatabaseBatches = async (
  database: Database,
  statements: ReadonlyArray<DatabaseBatchStatement>,
) => {
  for (let index = 0; index < statements.length; index += databaseBatchSize) {
    const chunk = statements.slice(index, index + databaseBatchSize);
    const first = chunk[0];
    if (first) {
      await database.batch([first, ...chunk.slice(1)]);
    }
  }
};

const getDb = (): Database => {
  const database = store.getStore();
  if (!database) {
    throw new Error('Codiff sharing database is unavailable.');
  }
  return database;
};

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});

export { and, eq, gte, sql };
