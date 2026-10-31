// Creates the collections' indexes, then loads starter content.
//   npm run setup         – create missing indexes; seed only if the database is empty
//   npm run setup:fresh   – drop the whole database and start over
import fs from 'node:fs';
import { config } from './config.js';
import { closeDb, count, getDb } from './db.js';
import { COLLECTIONS, INDEXES } from './schema.js';
import { seed, seedClass, seedShop } from './seed.js';
import { syncDictionary } from './dictionary.js';

const fresh = process.argv.includes('--fresh');

async function main() {
  console.log(`Setting up database (${config.db.uri.replace(/\/\/[^@/]*@/, '//***@')})…`);
  const db = await getDb();

  if (fresh) {
    await db.dropDatabase();
    console.log('Dropped the existing database.');
  }
  for (const name of COLLECTIONS) await db.collection(name).createIndex({ id: 1 }, { unique: true });
  for (const [name, keys, options] of INDEXES) await db.collection(name).createIndex(keys, options);
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  if ((await count('users')) === 0) {
    await seed();
    console.log('Starter content loaded.');
    console.log('  Admin login:   admin@nyayagrantha.local / admin123');
    console.log('  Editor login:  editor@nyayagrantha.local / editor123');
    console.log('  Student login: student@nyayagrantha.local / student123');
    console.log('  Change these passwords after first login.');
  } else {
    console.log('Database already has data — seed skipped (use npm run setup:fresh to reset).');
    // The dictionary grows between releases: add new starter terms without touching edited ones.
    const { added, enriched } = await syncDictionary();
    console.log(`Dictionary: ${added} terms added, ${enriched} enriched.`);
    if (await seedClass()) console.log('Demo class added: faculty@nyayagrantha.local teaches it, join code NYAYA1.');
    if (await seedShop()) console.log('Demo shop added: vendor@nyayagrantha.local / vendor123.');
  }
  await closeDb();
  console.log('Done.');
}

main().catch((e) => {
  console.error('\nSetup failed:', e.message);
  if (/ECONNREFUSED|Server selection timed out/i.test(e.message)) console.error(`MongoDB is not reachable at ${config.db.uri}. Start MongoDB, or set MONGODB_URI in server/.env.`);
  process.exit(1);
});
