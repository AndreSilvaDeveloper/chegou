import { extrairDeTexto } from './etiqueta-parser';

/**
 * Estes casos são etiquetas escritas à mão, não amostras reais — servem para
 * travar as armadilhas conhecidas enquanto o banco de amostras
 * (`/admin/etiquetas`) não tem volume. Quando uma amostra real quebrar o
 * parser, traga o caso para cá antes de consertar a regex.
 */
describe('extrairCampos', () => {
  it('lê uma etiqueta dos Correios completa', () => {
    const r = extrairDeTexto([
      'CORREIOS',
      'DESTINATARIO:',
      'Maria Aparecida Souza',
      'Rua das Palmeiras, 120 - Apto 302 Bloco B',
      'Bairro Centro - Juiz de Fora/MG',
      'CEP 36010-000',
      'LB123456789BR',
    ]);

    expect(r).toMatchObject({
      destinatario: 'MARIA APARECIDA SOUZA',
      bloco: 'B',
      numero: '302',
      transportadora: 'Correios',
      codigoRastreio: 'LB123456789BR',
      cep: '36010-000',
    });
  });

  it('aceita a unidade colada na palavra-chave', () => {
    expect(extrairDeTexto(['ENTREGAR NO AP302']).numero).toBe('302');
    expect(extrairDeTexto(['AP.302']).numero).toBe('302');
    expect(extrairDeTexto(['APARTAMENTO 302']).numero).toBe('302');
  });

  it('não confunde TRANSPORTADORA com bloco TR', () => {
    // `TR` + captura livre pegaria "ANSP". O `\b` depois da palavra-chave é o
    // que impede — se esta quebrar, a regex de bloco perdeu o boundary.
    expect(extrairDeTexto(['TRANSPORTADORA XYZ LTDA']).bloco).toBeNull();
  });

  it('prefere o destinatário rotulado ao nome do remetente', () => {
    const r = extrairDeTexto([
      'REMETENTE:',
      'Joao Carlos Pereira',
      'DESTINATARIO:',
      'Ana Beatriz Lima',
    ]);
    expect(r.destinatario).toBe('ANA BEATRIZ LIMA');
  });

  it('pula a zona do remetente quando não há rótulo de destinatário', () => {
    const r = extrairDeTexto(['REMETENTE', 'Loja Fulano ME', 'Ana Beatriz Lima', 'APTO 12']);
    expect(r.destinatario).toBe('ANA BEATRIZ LIMA');
  });

  it('não inventa CEP a partir de um número comprido', () => {
    // 15 dígitos seguidos: nota fiscal, não CEP.
    expect(extrairDeTexto(['NF 123456789012345']).cep).toBeNull();
  });

  it('reconhece Amazon e Shopee pelo código', () => {
    expect(extrairDeTexto(['TBA123456789']).transportadora).toBe('Amazon');
    expect(extrairDeTexto(['SPXBR12345678']).transportadora).toBe('Shopee');
  });

  it('conserta o código dos Correios lido com letra no lugar de dígito', () => {
    // O OCR leu o `0` do meio como `O`. O formato é rígido, então dá para
    // corrigir posicionalmente.
    expect(extrairDeTexto(['LBI234567B9BR']).codigoRastreio).toBe('LB123456789BR');
  });

  it('cai no formato compacto só quando não há palavra-chave', () => {
    expect(extrairDeTexto(['ENTREGA B-302']).bloco).toBe('B');
    expect(extrairDeTexto(['ENTREGA B-302']).numero).toBe('302');
    // Com palavra-chave, o compacto não atropela.
    const r = extrairDeTexto(['BLOCO C APTO 101', 'PEDIDO A-1234']);
    expect(r.bloco).toBe('C');
    expect(r.numero).toBe('101');
  });

  it('devolve tudo nulo sem estourar quando o OCR não leu nada', () => {
    expect(extrairDeTexto([])).toEqual({
      destinatario: null, bloco: null, numero: null, andar: null,
      transportadora: null, codigoRastreio: null, cep: null,
    });
  });

  it('lê o andar em qualquer das formas', () => {
    expect(extrairDeTexto(['3 ANDAR']).andar).toBe('3');
    expect(extrairDeTexto(['ANDAR: 12']).andar).toBe('12');
    expect(extrairDeTexto(['PISO 2']).andar).toBe('2');
  });
});
