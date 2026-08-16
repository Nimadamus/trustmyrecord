import { createRequire } from 'node:module';
import fs from 'node:fs';
import { FREE_ACCOUNT_FILE, readFreeAccount } from './blp-live-setup.mjs';

/**
 * Remove the free-tier account this run created.
 *
 * The suite provisions its own free fixture (see blp-live-setup.mjs) instead of
 * borrowing a hand-registered member, because borrowing one is what produced
 * user 2136 `ledgercheck_mv7`. Provenance already keeps that account out of
 * every public surface, so what is left here is hygiene: not accumulating one
 * dead row per run.
 *
 * There is no self-service delete endpoint on the API, so this goes to the
 * database. Set TMR_QA_DATABASE_URL (or DATABASE_URL) to the TrustMyRecord
 * connection string to enable it. Without one, teardown does not fail the run --
 * it prints the account name so it can be removed by hand, since a
 * provenance-marked account is inert either way.
 *
 * Four guards, all of which must hold before a single row is deleted:
 *   1. this run created the account (`ephemeral: true` in the state file)
 *   2. the username carries the automation prefix
 *   3. the row in the database has a non-null `automation_provenance`
 *   4. the id matches the one signup returned
 * A human account fails 2, 3 and 4, so this cannot touch one.
 */
const CONN = process.env.TMR_QA_DATABASE_URL || process.env.DATABASE_URL;

export default async function globalTeardown() {
  const acct = readFreeAccount();
  if (!acct) return;

  if (!acct.ephemeral) {
    console.log(`[blp-live] free fixture ${acct.user} was supplied via BLP_LIVE_FREE_USER — left alone`);
    return;
  }
  if (!/^qa_/.test(acct.user || '')) {
    console.warn(`[blp-live] REFUSING to delete "${acct.user}": not an automation username. Remove it by hand.`);
    return;
  }
  if (!CONN) {
    console.warn(
      `[blp-live] no TMR_QA_DATABASE_URL set, so the ephemeral fixture ${acct.user} (id ${acct.userId}) was NOT deleted.\n` +
      `[blp-live] It is provenance-marked and excluded from every public surface, but delete it when convenient.`
    );
    return;
  }

  let Client;
  try {
    ({ Client } = createRequire(import.meta.url)('pg'));
  } catch {
    console.warn(`[blp-live] the 'pg' package is not installed, so ${acct.user} was NOT deleted. Run: npm i -D pg`);
    return;
  }

  const db = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const found = await db.query(
      `SELECT id, username, automation_provenance FROM users WHERE id = $1 AND username = $2`,
      [acct.userId, acct.user]
    );
    if (found.rowCount !== 1) {
      console.warn(`[blp-live] ${acct.user} (id ${acct.userId}) not found — nothing to delete`);
      return;
    }
    if (!found.rows[0].automation_provenance) {
      console.error(
        `[blp-live] ABORT: ${acct.user} has NO automation_provenance, so production may be counting it as a member. ` +
        `Refusing to delete it silently — investigate before removing.`
      );
      return;
    }

    // Every column that points at users.id, resolved from the live schema so a
    // new table can never leave an orphan behind.
    const fks = await db.query(`
      SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_name = 'users' AND ccu.column_name = 'id'
         AND tc.table_schema = 'public'`);

    await db.query('BEGIN');
    try {
      let removed = 0;
      for (const { table_name, column_name } of fks.rows) {
        try {
          const r = await db.query(`DELETE FROM "${table_name}" WHERE "${column_name}" = $1`, [acct.userId]);
          removed += r.rowCount;
        } catch (e) {
          // A restrictive FK elsewhere is a real signal, not something to swallow.
          throw new Error(`could not clear ${table_name}.${column_name}: ${e.message}`);
        }
      }
      const gone = await db.query(
        `DELETE FROM users WHERE id = $1 AND username = $2 AND automation_provenance IS NOT NULL`,
        [acct.userId, acct.user]
      );
      await db.query('COMMIT');
      console.log(`[blp-live] deleted ephemeral fixture ${acct.user} (id ${acct.userId}): ${gone.rowCount} user row, ${removed} dependent rows`);
    } catch (e) {
      await db.query('ROLLBACK');
      console.error(`[blp-live] teardown rolled back, ${acct.user} still exists: ${e.message}`);
    }
  } finally {
    await db.end();
    fs.rmSync(FREE_ACCOUNT_FILE, { force: true });
  }
}
