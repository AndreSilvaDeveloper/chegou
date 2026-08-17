import { baseDeSlug, slugDoNome, sufixoAleatorio } from './slug';

describe('slugDoNome', () => {
  it('minúsculas, hífen no lugar do espaço', () => {
    expect(slugDoNome('Residencial Aurora')).toBe('residencial-aurora');
  });

  /**
   * O caso que justifica o `normalize('NFD')` sem regex de diacrítico: a marca
   * de acento vem DEPOIS da letra base, então ela colapsa no separador seguinte
   * em vez de partir a palavra ao meio.
   */
  it('tira o acento sem partir a palavra', () => {
    expect(slugDoNome('José')).toBe('jose');
    expect(slugDoNome('Ipê Amarelo')).toBe('ipe-amarelo');
    expect(slugDoNome('Condomínio Açaí')).toBe('condominio-acai');
  });

  it('não deixa número nem caractere especial', () => {
    expect(slugDoNome('Ed. 33 Andares')).toBe('ed-andares');
    expect(slugDoNome('Villa & Cia (Bloco #2)')).toBe('villa-cia-bloco');
  });

  it('não deixa hífen dobrado nem nas pontas', () => {
    expect(slugDoNome('  --Aurora   Bela--  ')).toBe('aurora-bela');
  });

  it('devolve vazio quando não sobra letra nenhuma', () => {
    expect(slugDoNome('123 456')).toBe('');
  });
});

describe('baseDeSlug', () => {
  it('respeita o mínimo de 3 caracteres do formato', () => {
    // "A2" viraria "a", que o `@Matches(/^[a-z0-9-]{3,80}$/)` recusa.
    const base = baseDeSlug('A2');
    expect(base.length).toBeGreaterThanOrEqual(3);
    expect(base).toMatch(/^[a-z-]+$/);
  });

  it('inventa um slug inteiro quando o nome não tem letra', () => {
    const base = baseDeSlug('123');
    expect(base).toMatch(/^[a-z]{4}$/);
  });

  it('corta em 70 para sobrar espaço ao sufixo de desempate', () => {
    expect(baseDeSlug('a'.repeat(200))).toHaveLength(70);
  });

  it('cabe no formato aceito pelo DTO', () => {
    for (const nome of ['Residencial Aurora', 'Ipê', 'A2', '123', 'x'.repeat(200)]) {
      expect(`${baseDeSlug(nome)}-${sufixoAleatorio()}`).toMatch(/^[a-z0-9-]{3,80}$/);
    }
  });
});

describe('sufixoAleatorio', () => {
  it('só letras — o slug inteiro segue sem números', () => {
    expect(sufixoAleatorio()).toMatch(/^[a-z]{4}$/);
  });
});
