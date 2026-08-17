import { Apartamento, Encomenda, Morador, Tenant } from '../../database/entities';
import {
  TEMPLATES_ENCOMENDA,
  TEMPLATES_RETIRADA,
  aplicarSaudacao,
  buildEncomendaVars,
  buildRetiradaVars,
  renderTemplate,
  saudacaoPara,
  sortearTemplateEncomenda,
  sortearTemplateRetirada,
} from './message-template';

const encomenda = {
  tipo: 'caixa',
  transportadora: 'Correios',
  codigoRetirada: '4827',
  createdAt: new Date('2026-07-27T12:00:00Z'),
  retiradaAt: new Date('2026-07-27T21:02:00Z'), // 18:02 em São Paulo
  apartamento: { identificador: 'A-101' },
} as unknown as Encomenda;

const morador = { nome: 'João da Silva' } as unknown as Morador;
const tenant = { nome: 'Residencial Aurora' } as unknown as Tenant;
const apartamento = { identificador: 'A-101' } as unknown as Apartamento;

/** Instante UTC correspondente a uma hora de parede em São Paulo (UTC-3). */
function emSaoPaulo(hora: number): Date {
  return new Date(Date.UTC(2026, 6, 27, hora + 3, 0, 0));
}

describe('versões de mensagem (anti-bloqueio)', () => {
  it('são cinco de cada tipo', () => {
    expect(TEMPLATES_ENCOMENDA).toHaveLength(5);
    expect(TEMPLATES_RETIRADA).toHaveLength(5);
  });

  it('nenhuma versão é igual a outra', () => {
    expect(new Set(TEMPLATES_ENCOMENDA).size).toBe(TEMPLATES_ENCOMENDA.length);
    expect(new Set(TEMPLATES_RETIRADA).size).toBe(TEMPLATES_RETIRADA.length);
  });

  it('toda versão abre com a saudação e traz o essencial', () => {
    for (const t of TEMPLATES_ENCOMENDA) {
      expect(t.startsWith('{{saudacao}}, {{nome}}')).toBe(true);
      // Sem o código o morador não retira: é o mínimo operacional da chegada.
      expect(t).toContain('{{codigo}}');
    }
    for (const t of TEMPLATES_RETIRADA) {
      expect(t.startsWith('{{saudacao}}, {{nome}}')).toBe(true);
      // O código já foi usado — repeti-lo depois da retirada só confunde.
      expect(t).not.toContain('{{codigo}}');
    }
  });

  it('o sorteio cobre todas as versões', () => {
    const chegada = new Set(Array.from({ length: 300 }, () => sortearTemplateEncomenda()));
    const retirada = new Set(Array.from({ length: 300 }, () => sortearTemplateRetirada()));
    expect(chegada.size).toBe(TEMPLATES_ENCOMENDA.length);
    expect(retirada.size).toBe(TEMPLATES_RETIRADA.length);
  });
});

describe('saudação pelo horário', () => {
  it.each([
    [5, 'Bom dia'],
    [8, 'Bom dia'],
    [11, 'Bom dia'],
    [12, 'Boa tarde'],
    [17, 'Boa tarde'],
    [18, 'Boa noite'],
    [23, 'Boa noite'],
    [3, 'Boa noite'],
  ])('%ih em São Paulo → %s', (hora, esperado) => {
    expect(saudacaoPara(emSaoPaulo(hora as number))).toBe(esperado);
  });

  it('{{saudacao}} atravessa a renderização das variáveis', () => {
    const vars = buildEncomendaVars(encomenda, morador, tenant);
    const texto = renderTemplate(TEMPLATES_ENCOMENDA[0], vars);
    expect(texto).toContain('{{saudacao}}');
    expect(texto).toContain('João');
  });

  it('aplicarSaudacao fecha o texto no horário de envio', () => {
    const vars = buildEncomendaVars(encomenda, morador, tenant);
    const parcial = renderTemplate(TEMPLATES_ENCOMENDA[0], vars);
    const final = aplicarSaudacao(parcial, emSaoPaulo(9));
    expect(final.startsWith('Bom dia, João!')).toBe(true);
    expect(final).not.toMatch(/\{\{/);
  });

  it('mensagem sem o token atravessa intacta', () => {
    expect(aplicarSaudacao('Aviso do condomínio', emSaoPaulo(9))).toBe('Aviso do condomínio');
  });
});

describe('variáveis das mensagens', () => {
  it('retirada usa a data/hora da retirada, não a do recebimento', () => {
    const vars = buildRetiradaVars(encomenda, morador, tenant, apartamento);
    expect(vars.hora).toBe('18:02');
    expect(vars.data).toBe('27/07/2026');
    expect(vars.nome).toBe('João');
    expect(vars.unidade).toBe('A-101');
  });

  it('nenhuma versão deixa {{token}} solto depois de renderizada', () => {
    const varsChegada = buildEncomendaVars(encomenda, morador, tenant);
    const varsRetirada = buildRetiradaVars(encomenda, morador, tenant, apartamento);

    for (const t of TEMPLATES_ENCOMENDA) {
      const texto = aplicarSaudacao(renderTemplate(t, varsChegada), emSaoPaulo(14));
      expect(texto).not.toMatch(/\{\{/);
      expect(texto).toContain('4827');
    }
    for (const t of TEMPLATES_RETIRADA) {
      const texto = aplicarSaudacao(renderTemplate(t, varsRetirada), emSaoPaulo(14));
      expect(texto).not.toMatch(/\{\{/);
      expect(texto).toContain('Boa tarde, João!');
    }
  });
});
