/**
 * Prévia da assinatura: quanto cada cliente pagaria se o mês fechasse hoje.
 *
 *   npm run assinatura:previa
 *
 * Lê o banco configurado no `.env` e não escreve nada — é uma conferência do
 * cálculo (faixas, carteira somada, preço especial) sem depender de tela.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AssinaturasService } from '../src/modules/assinaturas/assinaturas.service';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const service = app.get(AssinaturasService);

  console.log('\n--- Tabela de preços ---');
  for (const f of await service.faixas()) {
    const ate = f.ateQuantidade === null ? 'acima disso' : `até ${f.ateQuantidade}`;
    console.log(`  ${ate.padEnd(14)} ${brl(f.precoApartamento)} / apartamento`);
  }

  console.log('\n--- Prévia do mês ---');
  const previas = await service.listarPrevias();
  if (previas.length === 0) console.log('  (nenhum cliente ativo)');

  let total = 0;
  for (const p of previas) {
    total += p.resultado.valor;
    const tipo = p.sacado.tipo === 'administradora' ? 'ADM' : 'CND';
    const preco = p.resultado.precoAplicado === null ? 'valor fixo' : brl(p.resultado.precoAplicado);
    console.log(
      `  [${tipo}] ${p.sacado.nome.padEnd(28)} ${String(p.resultado.quantidadeApartamentos).padStart(4)} aptos` +
        `  × ${preco}  = ${brl(p.resultado.valor)}${p.condicao ? '  (preço especial)' : ''}`,
    );
    if (p.resultado.itens.length > 1) {
      for (const item of p.resultado.itens) {
        console.log(
          `         · ${item.nome.padEnd(26)} ${String(item.apartamentos).padStart(4)} → ${brl(item.subtotal)}`,
        );
      }
    }
  }

  console.log(`\n  TOTAL: ${brl(total)}\n`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
