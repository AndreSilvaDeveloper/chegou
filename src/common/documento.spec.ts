import {
  cnpjValido,
  cpfValido,
  documentoValido,
  formatarDocumento,
  normalizarDocumento,
} from './documento';

/**
 * O documento é o que identifica o cliente no gateway de pagamento. Documento
 * inválido não é erro de digitação inofensivo: ele passa pelo cadastro, some da
 * vista, e reaparece meses depois como uma cobrança que não pôde ser emitida.
 */

describe('normalizarDocumento', () => {
  it.each([
    ['123.456.789-01', '12345678901'],
    ['12.345.678/0001-90', '12345678000190'],
    ['  11222333000181  ', '11222333000181'],
  ])('tira a máscara de %s', (entrada, esperado) => {
    expect(normalizarDocumento(entrada)).toBe(esperado);
  });

  it.each([
    ['', null],
    ['   ', null],
    ['---', null],
  ])('campo vazio (%s) vira null, não string vazia', (entrada) => {
    expect(normalizarDocumento(entrada)).toBeNull();
  });

  it('preserva null e undefined — quem trata ausência é o @IsOptional', () => {
    expect(normalizarDocumento(null)).toBeNull();
    expect(normalizarDocumento(undefined)).toBeUndefined();
  });
});

describe('cpfValido', () => {
  it.each(['11144477735', '52998224725'])('aceita CPF válido %s', (cpf) => {
    expect(cpfValido(cpf)).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(cpfValido('11144477736')).toBe(false);
  });

  it('recusa sequência de dígitos iguais, que passa na conta mas não existe', () => {
    expect(cpfValido('00000000000')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(cpfValido('1114447773')).toBe(false);
    expect(cpfValido('111444777355')).toBe(false);
  });
});

describe('cnpjValido', () => {
  it.each(['11222333000181', '11444777000161'])('aceita CNPJ válido %s', (cnpj) => {
    expect(cnpjValido(cnpj)).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(cnpjValido('11222333000182')).toBe(false);
  });

  it('recusa sequência de dígitos iguais', () => {
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('documentoValido', () => {
  it('aceita os dois formatos — é o ponto da mudança', () => {
    expect(documentoValido('11144477735')).toBe(true);
    expect(documentoValido('11222333000181')).toBe(true);
  });

  it('recusa o que não é nenhum dos dois', () => {
    expect(documentoValido('123')).toBe(false);
    expect(documentoValido('')).toBe(false);
  });
});

describe('formatarDocumento', () => {
  it('mascara CPF e CNPJ para exibição', () => {
    expect(formatarDocumento('11144477735')).toBe('111.444.777-35');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('devolve vazio para ausente, sem quebrar a tela', () => {
    expect(formatarDocumento(null)).toBe('');
    expect(formatarDocumento(undefined)).toBe('');
  });

  it('tamanho inesperado sai como veio, em vez de virar máscara errada', () => {
    expect(formatarDocumento('123')).toBe('123');
  });
});
