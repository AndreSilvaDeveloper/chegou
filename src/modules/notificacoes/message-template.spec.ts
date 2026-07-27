import { Apartamento, Encomenda, Morador, Tenant } from '../../database/entities';
import {
  DEFAULT_TEMPLATE_ENCOMENDA,
  DEFAULT_TEMPLATE_RETIRADA,
  buildRetiradaVars,
  renderTemplate,
  resolveTemplateEncomenda,
  resolveTemplateRetirada,
} from './message-template';

const encomenda = {
  tipo: 'caixa',
  transportadora: 'Correios',
  createdAt: new Date('2026-07-27T12:00:00Z'),
  retiradaAt: new Date('2026-07-27T21:02:00Z'), // 18:02 em São Paulo
} as unknown as Encomenda;

const morador = { nome: 'João da Silva' } as unknown as Morador;
const tenant = { nome: 'Residencial Aurora' } as unknown as Tenant;
const apartamento = { identificador: 'A-101' } as unknown as Apartamento;

describe('templates personalizáveis do condomínio', () => {
  it('template vazio cai no padrão do sistema', () => {
    expect(resolveTemplateEncomenda('')).toBe(DEFAULT_TEMPLATE_ENCOMENDA);
    expect(resolveTemplateEncomenda('   ')).toBe(DEFAULT_TEMPLATE_ENCOMENDA);
    expect(resolveTemplateRetirada(null)).toBe(DEFAULT_TEMPLATE_RETIRADA);
    expect(resolveTemplateRetirada(undefined)).toBe(DEFAULT_TEMPLATE_RETIRADA);
  });

  it('template do condomínio vence o padrão', () => {
    expect(resolveTemplateRetirada('Oi {{nome}}')).toBe('Oi {{nome}}');
  });

  it('retirada usa a data/hora da retirada, não a do recebimento', () => {
    const vars = buildRetiradaVars(encomenda, morador, tenant, apartamento);
    expect(vars.hora).toBe('18:02');
    expect(vars.data).toBe('27/07/2026');
    expect(vars.nome).toBe('João');
    expect(vars.unidade).toBe('A-101');
  });

  it('renderiza o padrão de retirada sem deixar {{token}} solto', () => {
    const vars = buildRetiradaVars(encomenda, morador, tenant, apartamento);
    const texto = renderTemplate(DEFAULT_TEMPLATE_RETIRADA, vars);
    expect(texto).toContain('João');
    expect(texto).toContain('A-101');
    expect(texto).toContain('Residencial Aurora');
    expect(texto).not.toMatch(/\{\{/);
  });
});
