/**
 * Seed de produção — cria APENAS o superadmin da plataforma (idempotente).
 * Node puro (sem ts-node): usa apenas `pg` e `bcrypt`, que já estão na imagem de produção.
 *
 * Uso (no servidor):
 *   docker compose exec api node scripts/seed-prod.js
 *
 * Lê do ambiente do container:
 *   DATABASE_URL            (obrigatório)
 *   SUPERADMIN_EMAIL        (default: admin@portaria.app)
 *   SUPERADMIN_PASSWORD     (obrigatório — defina no deploy/.env)
 *   SUPERADMIN_NOME         (default: Super Admin)
 *   BCRYPT_ROUNDS           (default: 12)
 *   SEED_RESET_PASSWORD     (opcional: "true" reseta a senha se o usuário já existir)
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const email = (process.env.SUPERADMIN_EMAIL || 'admin@portaria.app').trim();
  const nome = (process.env.SUPERADMIN_NOME || 'Super_Admin').trim();
  const senha = process.env.SUPERADMIN_PASSWORD;
  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const reset = String(process.env.SEED_RESET_PASSWORD || '').toLowerCase() === 'true';

  if (!senha || senha.length < 6) {
    console.error('SUPERADMIN_PASSWORD ausente ou muito curta (mín. 6 chars). Defina em deploy/.env.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const found = await client.query(
      'SELECT id FROM users WHERE tenant_id IS NULL AND email = $1 LIMIT 1',
      [email],
    );

    if (found.rowCount > 0) {
      if (reset) {
        const hash = await bcrypt.hash(senha, rounds);
        await client.query('UPDATE users SET senha_hash = $1, ativo = true WHERE id = $2', [
          hash,
          found.rows[0].id,
        ]);
        console.log(`[ok] senha do superadmin ${email} redefinida.`);
      } else {
        console.log(`[skip] superadmin ${email} já existe (use SEED_RESET_PASSWORD=true para resetar a senha).`);
      }
      return;
    }

    const hash = await bcrypt.hash(senha, rounds);
    await client.query(
      `INSERT INTO users (tenant_id, nome, email, senha_hash, role, ativo)
       VALUES (NULL, $1, $2, $3, 'superadmin', true)`,
      [nome, email, hash],
    );
    console.log(`[ok] superadmin criado: ${email}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Seed de produção falhou:', err);
  process.exit(1);
});
