require('dotenv').config();

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  dir: 'db/migrations',
  migrationsTable: 'pgmigrations',
  fileExtension: 'sql',
  decamelize: false,
  schema: 'public',
};
