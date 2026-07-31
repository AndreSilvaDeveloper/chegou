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

  /**
   * A classe de bug mais cara que este parser já teve: as linhas do OCR são
   * unidas por `' \n '` e `\s*` casa `\n`, então uma palavra-chave no fim de uma
   * linha capturava o primeiro número da linha SEGUINTE. Como `String.match`
   * devolve a primeira ocorrência do blob, o valor falso ainda vencia o
   * verdadeiro impresso mais abaixo — campo preenchido com valor errado, que é
   * pior que campo vazio: ninguém confere o que já veio preenchido.
   */
  describe('não deixa a captura atravessar a quebra de linha', () => {
    it('não tira o número da unidade do bloco de peso', () => {
      const r = extrairDeTexto(['QTD 1 UN', '0,350 KG', 'APTO 51']);
      expect(r.numero).toBe('51');
    });

    it('não confunde CASA com o telefone da linha seguinte', () => {
      expect(extrairDeTexto(['CASA', '1234-5678']).numero).toBeNull();
    });

    it('não tira o bloco do número da rua na linha seguinte', () => {
      expect(extrairDeTexto(['AVENIDA BRASIL 1500 BL', '12']).bloco).toBeNull();
    });

    it('ignora unidade de medida colada no número', () => {
      expect(extrairDeTexto(['PESO LIQUIDO 2 KG']).numero).toBeNull();
    });
  });

  describe('variações de escrita da unidade', () => {
    it('aceita o numeral entre a palavra-chave e o número', () => {
      expect(extrairDeTexto(['APTO Nº 302']).numero).toBe('302');
      expect(extrairDeTexto(['APTO N 302']).numero).toBe('302');
      expect(extrairDeTexto(['APTO NO 302']).numero).toBe('302');
    });

    it('junta o sufixo de letra ao número', () => {
      expect(extrairDeTexto(['APTO 302-B']).numero).toBe('302B');
      expect(extrairDeTexto(['APTO 302B']).numero).toBe('302B');
    });

    it('lê a letra colada como bloco quando não há bloco declarado', () => {
      const r = extrairDeTexto(['APTO B102']);
      expect(r.bloco).toBe('B');
      expect(r.numero).toBe('102');
    });

    it('não deixa a letra colada sobrescrever um bloco declarado', () => {
      const r = extrairDeTexto(['BLOCO C', 'APTO B102']);
      expect(r.bloco).toBe('C');
    });

    it('lê o número que vem logo depois do bloco, sem palavra-chave', () => {
      const r = extrairDeTexto(['BLOCO B - 302']);
      expect(r.bloco).toBe('B');
      expect(r.numero).toBe('302');
    });
  });

  describe('destinatário', () => {
    it('aceita o rótulo sem pontuação, sozinho na linha', () => {
      const r = extrairDeTexto(['DESTINATARIO', 'Carla Mendes Rocha', 'APTO 44']);
      expect(r.destinatario).toBe('CARLA MENDES ROCHA');
    });

    it('não devolve o remetente quando o rótulo existe mas não há nome perto', () => {
      const r = extrairDeTexto([
        'Joao Pedro Alves',
        'DESTINATARIO:',
        'CEP 36010-000',
        'RUA DAS FLORES 100',
      ]);
      expect(r.destinatario).toBeNull();
    });

    it('não descarta nome de pessoa por causa de palavra que só o contém', () => {
      // Estes caíam com o `includes`: `CHAVE` dentro de "Chaves", `SERIE`
      // dentro de "Seriema". São sobrenomes reais de moradores reais.
      expect(extrairDeTexto(['DEST:', 'Maria Chaves Souza']).destinatario).toBe('MARIA CHAVES SOUZA');
      expect(extrairDeTexto(['DEST:', 'Ana Paula Seriema']).destinatario).toBe('ANA PAULA SERIEMA');
    });

    it('trata tipo de logradouro pela posição, não pela palavra', () => {
      // "Praça" abre um endereço e também é sobrenome. Quem decide é onde ela
      // está: primeira palavra da linha é logradouro, no meio é nome.
      expect(extrairDeTexto(['DEST:', 'Ana Cristina Praca']).destinatario).toBe('ANA CRISTINA PRACA');
      expect(extrairDeTexto(['DEST:', 'Praca da Liberdade']).destinatario).toBeNull();
    });

    it('aceita inicial abreviada', () => {
      expect(extrairDeTexto(['DEST:', 'Maria A. Silva']).destinatario).toBe('MARIA A. SILVA');
    });

    it('não elege razão social como destinatário', () => {
      const r = extrairDeTexto(['MERCADO LIVRE BRASIL LTDA', 'APTO 10']);
      expect(r.destinatario).toBeNull();
    });
  });

  describe('transportadora', () => {
    it('reconhece a marca quebrada em duas linhas', () => {
      // `\s?` não atravessa o separador de 3 caracteres `' \n '` — e logotipo
      // impresso em duas linhas é a regra, não a exceção.
      expect(extrairDeTexto(['MERCADO', 'LIVRE']).transportadora).toBe('Mercado Livre');
      expect(extrairDeTexto(['TOTAL', 'EXPRESS']).transportadora).toBe('Total Express');
    });

    it('a marca própria ganha do PAC no rodapé', () => {
      const r = extrairDeTexto(['MERCADO LIVRE', 'ENVIO VIA PAC']);
      expect(r.transportadora).toBe('Mercado Livre');
    });
  });
});
