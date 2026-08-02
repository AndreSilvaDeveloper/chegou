#!/usr/bin/env node
/**
 * Sobe a versão do Chegou nos três package.json de uma vez.
 *
 *   npm run versao correcao    # 0.9.0 -> 0.9.1   bug corrigido
 *   npm run versao recurso     # 0.9.1 -> 0.10.0  funcionalidade grande
 *   npm run versao maior       # 0.10.0 -> 1.0.0  virada de versão
 *   npm run versao 1.2.3       # define exatamente
 *
 * São três arquivos porque cada app é buildado a partir da **própria pasta**
 * (`deploy/docker-compose.yml`): a API na raiz, o painel em `web/`, a landing
 * em `landing/`. Um número só para os três é o que faz a versão da sidebar
 * valer para o sistema inteiro — por isso o script mexe sempre em todos, nunca
 * em um só.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARQUIVOS = [
  join(raiz, 'package.json'),
  join(raiz, 'web', 'package.json'),
  join(raiz, 'landing', 'package.json'),
];

const TIPOS = {
  correcao: 'patch',
  patch: 'patch',
  fix: 'patch',
  recurso: 'minor',
  minor: 'minor',
  feat: 'minor',
  maior: 'major',
  major: 'major',
};

const arg = (process.argv[2] || '').toLowerCase();
if (!arg) {
  console.error('Uso: npm run versao <correcao|recurso|maior|X.Y.Z>');
  process.exit(1);
}

function ler(arquivo) {
  return JSON.parse(readFileSync(arquivo, 'utf-8'));
}

const atual = ler(ARQUIVOS[0]).version;
const [maior, menor, correcao] = atual.split('.').map(Number);

let nova;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  nova = arg;
} else if (TIPOS[arg] === 'major') {
  nova = `${maior + 1}.0.0`;
} else if (TIPOS[arg] === 'minor') {
  nova = `${maior}.${menor + 1}.0`;
} else if (TIPOS[arg] === 'patch') {
  nova = `${maior}.${menor}.${correcao + 1}`;
} else {
  console.error(`Não entendi "${arg}". Use: correcao | recurso | maior | X.Y.Z`);
  process.exit(1);
}

for (const arquivo of ARQUIVOS) {
  const conteudo = readFileSync(arquivo, 'utf-8');
  const pkg = JSON.parse(conteudo);
  if (pkg.version !== atual) {
    console.warn(`Aviso: ${arquivo} estava em ${pkg.version}, não em ${atual}. Alinhando.`);
  }
  // Substituição textual para não reordenar nem reformatar o arquivo inteiro.
  writeFileSync(arquivo, conteudo.replace(/"version":\s*"[^"]+"/, `"version": "${nova}"`));
}

console.log(`Versão ${atual} -> ${nova}`);
console.log('Agora descreva a mudança no CHANGELOG.md e commite junto.');
