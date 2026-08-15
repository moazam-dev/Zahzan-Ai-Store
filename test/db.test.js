import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/db.js';

describe('db test harness (PGlite)', () => {
  let db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('creates a scratch table, inserts with $1 params, and selects it back', async () => {
    await db.query(`
      CREATE TABLE scratch (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL
      )
    `);

    await db.query('INSERT INTO scratch (name) VALUES ($1)', ['hello']);

    const { rows } = await db.query('SELECT name FROM scratch WHERE name = $1', [
      'hello',
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('hello');
  });

  it('rolls back tx() on throw', async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS scratch_tx (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL
      )
    `);

    await expect(
      db.tx(async (t) => {
        await t.query('INSERT INTO scratch_tx (name) VALUES ($1)', ['should-not-persist']);
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const { rows } = await db.query('SELECT * FROM scratch_tx');
    expect(rows).toHaveLength(0);
  });

  it('commits tx() on normal return', async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS scratch_tx_commit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL
      )
    `);

    await db.tx(async (t) => {
      await t.query('INSERT INTO scratch_tx_commit (name) VALUES ($1)', ['persisted']);
    });

    const { rows } = await db.query('SELECT name FROM scratch_tx_commit');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('persisted');
  });
});
