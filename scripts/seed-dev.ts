import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import {
  Apartamento,
  AuditLog,
  Encomenda,
  Morador,
  Tenant,
  User,
  WhatsappMessage,
} from '../src/database/entities';

dotenv.config();

const DEFAULT_PASSWORD = 'senha123';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [Tenant, User, Apartamento, Morador, Encomenda, WhatsappMessage, AuditLog],
    synchronize: false,
  });

  await ds.initialize();
  console.log('Conectado ao banco.');

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const senhaHash = await bcrypt.hash(DEFAULT_PASSWORD, rounds);

  // 1. Superadmin
  const userRepo = ds.getRepository(User);
  let superadmin = await userRepo.findOne({ where: { email: 'admin@portaria.app', tenantId: undefined } });
  if (!superadmin) {
    superadmin = await userRepo.save(
      userRepo.create({
        tenantId: null,
        nome: 'Super Admin',
        email: 'admin@portaria.app',
        senhaHash,
        role: 'superadmin',
        ativo: true,
      }),
    );
    console.log(`[ok] superadmin criado: ${superadmin.email}`);
  } else {
    console.log(`[skip] superadmin já existe: ${superadmin.email}`);
  }

  // 2. Condomínio de teste
  const tenantRepo = ds.getRepository(Tenant);
  let tenant = await tenantRepo.findOne({ where: { slug: 'residencial-bela-vista' } });
  if (!tenant) {
    tenant = await tenantRepo.save(
      tenantRepo.create({
        nome: 'Residencial Bela Vista',
        slug: 'residencial-bela-vista',
        cidade: 'São Paulo',
        estado: 'SP',
        plano: 'basico',
        ativo: true,
      }),
    );
    console.log(`[ok] condomínio criado: ${tenant.nome}`);
  } else {
    console.log(`[skip] condomínio já existe: ${tenant.nome}`);
  }

  // 3. Síndico
  let sindico = await userRepo.findOne({ where: { email: 'sindico@bela-vista.app', tenantId: tenant.id } });
  if (!sindico) {
    sindico = await userRepo.save(
      userRepo.create({
        tenantId: tenant.id,
        nome: 'João Síndico',
        email: 'sindico@bela-vista.app',
        senhaHash,
        role: 'sindico',
        ativo: true,
      }),
    );
    console.log(`[ok] síndico criado: ${sindico.email}`);
  } else {
    console.log(`[skip] síndico já existe: ${sindico.email}`);
  }

  // 4. Porteiro
  let porteiro = await userRepo.findOne({ where: { email: 'porteiro@bela-vista.app', tenantId: tenant.id } });
  if (!porteiro) {
    porteiro = await userRepo.save(
      userRepo.create({
        tenantId: tenant.id,
        nome: 'Carlos Porteiro',
        email: 'porteiro@bela-vista.app',
        senhaHash,
        role: 'porteiro',
        ativo: true,
      }),
    );
    console.log(`[ok] porteiro criado: ${porteiro.email}`);
  } else {
    console.log(`[skip] porteiro já existe: ${porteiro.email}`);
  }

  // 5. Apartamentos + moradores
  const aptoRepo = ds.getRepository(Apartamento);
  const moradorRepo = ds.getRepository(Morador);

  const seedAptos = [
    { bloco: 'A', numero: '101', morador: { nome: 'Maria Silva',  telefone: '+5511988880001', doc: '12345678901' } },
    { bloco: 'A', numero: '102', morador: { nome: 'Pedro Souza',  telefone: '+5511988880002', doc: '12345678902' } },
    { bloco: 'B', numero: '201', morador: { nome: 'Ana Oliveira', telefone: '+5511988880003', doc: '12345678903' } },
  ];

  for (const s of seedAptos) {
    let apto = await aptoRepo.findOne({ where: { tenantId: tenant.id, bloco: s.bloco, numero: s.numero } });
    if (!apto) {
      apto = await aptoRepo.save(
        aptoRepo.create({ tenantId: tenant.id, bloco: s.bloco, numero: s.numero, ativo: true }),
      );
      console.log(`[ok] apto criado: ${apto.bloco}-${apto.numero}`);
    }
    const existingMorador = await moradorRepo.findOne({
      where: { tenantId: tenant.id, apartamentoId: apto.id, nome: s.morador.nome },
    });
    if (!existingMorador) {
      await moradorRepo.save(
        moradorRepo.create({
          tenantId: tenant.id,
          apartamentoId: apto.id,
          nome: s.morador.nome,
          telefoneE164: s.morador.telefone,
          documento: s.morador.doc,
          principal: true,
          receberWhatsapp: true,
          ativo: true,
        }),
      );
      console.log(`[ok] morador criado: ${s.morador.nome} (${apto.bloco}-${apto.numero})`);
    }
  }

  await ds.destroy();

  console.log('\n=== seed concluído ===');
  console.log('Senha padrão de todos os usuários: ' + DEFAULT_PASSWORD);
  console.log('Logins:');
  console.log('  superadmin → admin@portaria.app');
  console.log('  síndico    → sindico@bela-vista.app');
  console.log('  porteiro   → porteiro@bela-vista.app');
}

main().catch((err) => {
  console.error('Seed falhou:', err);
  process.exit(1);
});
