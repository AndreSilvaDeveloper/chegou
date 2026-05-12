import { renderTemplate, templateToVariables } from './templates';

describe('renderTemplate', () => {
  it('renderiza encomenda_chegou com código destacado', () => {
    const text = renderTemplate('encomenda_chegou', {
      nome: 'Maria',
      apartamento: 'A-101',
      codigo: '1234',
      condominio: 'Residencial X',
    });
    expect(text).toContain('Maria');
    expect(text).toContain('A-101');
    expect(text).toContain('*1234*');
    expect(text).toContain('Residencial X');
  });

  it('renderiza sem_encomenda_pendente sem variáveis sensíveis', () => {
    const text = renderTemplate('sem_encomenda_pendente', { nome: 'Pedro' });
    expect(text).toContain('Pedro');
    expect(text).not.toMatch(/\d{4}/);
  });

  it('templateToVariables expõe variáveis numeradas + nomeadas', () => {
    const vars = templateToVariables({
      nome: 'Ana',
      apartamento: 'B-201',
      codigo: '9999',
      condominio: 'Res Y',
    });
    expect(vars['1']).toBe('Ana');
    expect(vars['nome']).toBe('Ana');
    expect(vars['3']).toBe('9999');
  });
});
