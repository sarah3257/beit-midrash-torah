import {getMigrations} from 'better-auth/db/migration';
import {auth} from '../cloud/auth.mjs';
import {sql} from '../cloud/db.mjs';

const {runMigrations}=await getMigrations(auth.options);
await runMigrations();
await sql`CREATE TABLE IF NOT EXISTS torah_libraries(user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,library JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS torah_originals(user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,document_id TEXT NOT NULL,content BYTEA NOT NULL,total INTEGER NOT NULL,complete BOOLEAN NOT NULL DEFAULT false,PRIMARY KEY(user_id,document_id))`;
console.log('Cloud schema ready');
await sql.end();
process.exit(0);
