import type { LinhaOcr } from '../../../database/entities';
import { extrairComDiagnostico } from './etiqueta-parser';

/**
 * Etiquetas **reais**, transcritas de fotos de pacotes que chegaram no prédio da
 * Avenida Barão do Rio Branco 2288 (Juiz de Fora/MG) — um prédio comercial, onde
 * a unidade é sala, não apartamento.
 *
 * Diferente de `etiqueta-parser.spec.ts`, aqui as linhas têm **geometria**, e é
 * disso que os casos tratam. As quatro etiquetas quebravam o parser v2 pelo
 * mesmo motivo de fundo: sem posição, o texto da etiqueta inteira vira um blob
 * onde a primeira ocorrência de cada regex vence — e a primeira costuma ser a do
 * remetente, que todas as transportadoras imprimem no alto.
 *
 * Ao mexer no parser, rode isto antes do placar: uma amostra real que quebra é
 * um caso de regressão, e caso de regressão mora em teste.
 */

const ALTURA = 20;

/**
 * Monta as linhas do OCR a partir dos blocos visuais da etiqueta.
 *
 * Dentro de um bloco as linhas ficam a 6px (o parser agrupa); entre blocos, a
 * 66px (o parser separa). Os números não importam — a proporção sim, e ela é a
 * mesma que o serviço de OCR entrega: linhas de um mesmo parágrafo ficam bem
 * mais juntas que a altura de uma linha.
 */
function etiqueta(blocos: string[][]): LinhaOcr[] {
  const linhas: LinhaOcr[] = [];
  let y = 0;
  for (const bloco of blocos) {
    for (const texto of bloco) {
      linhas.push({ texto, confianca: 0.92, box: [0, y, 800, y + ALTURA] });
      y += ALTURA + 6;
    }
    y += 60;
  }
  return linhas;
}

describe('etiquetas reais', () => {
  /**
   * Mercado Livre, entrega por TXGRUPPI.
   *
   * Os dois defeitos que ela expõe:
   *
   * 1. **Não existe rótulo de destinatário.** O nome é a linha logo acima de
   *    `Endereço:`. O parser v2 caía na varredura global e devolvia
   *    `Felipe Oliveira Camargo` — o REMETENTE, impresso no topo.
   * 2. **A unidade é `Complemento: 2009`**, um número puro. Sem palavra-chave
   *    de apartamento em lugar nenhum da etiqueta, `numero` vinha `null`.
   */
  it('Mercado Livre: nome sem rótulo e unidade em "Complemento"', () => {
    const { campos, camposFracos } = extrairComDiagnostico(
      etiqueta([
        [
          'Felipe Oliveira Camargo',
          'Av. Antonio Candido 1500',
          'Painerra (Jordanesia)',
          'Cajamar, BR-SP - 07776000',
          'Venda: 2000017581420458',
        ],
        ['FSP04'],
        ['47602709015'],
        ['SMG2', '17:00'],
        ['FSP04 > SMG2 > 33'],
        ['SEG 27/07/2026', 'NF: 1530'],
        [
          'Ester de Lemos Guimarães (TXGRUPPI)',
          'Endereço: Avenida Barão do Rio Branco 2288, Centro',
          'CEP: 36016310',
          'Cidade de destino: Juiz de Fora, Minas Gerais',
          'Complemento: 2009',
        ],
        ['Chave de acceso', '35260767803209000164550010000015301371728513'],
      ]),
    );

    expect(campos).toMatchObject({
      // O apelido da conta entre parênteses sai: quem casa com o cadastro de
      // moradores é o nome civil.
      destinatario: 'ESTER DE LEMOS GUIMARAES',
      endereco: 'AVENIDA BARAO DO RIO BRANCO 2288',
      complemento: '2009',
      numero: '2009',
      bloco: null,
      bairro: 'CENTRO',
      cidade: 'JUIZ DE FORA',
      uf: 'MG',
      cep: '36016-310',
    });
    expect(camposFracos).toHaveLength(0);
  });

  /**
   * A mesma etiqueta, com a mesma ordem de leitura e **sem** a geometria.
   *
   * Serve de prova de que é a posição que resolve, e não uma regex nova: sem os
   * blocos, o remetente e o destino viram um texto só e o primeiro nome de
   * pessoa da etiqueta é o de quem enviou.
   */
  it('sem geometria, a mesma etiqueta devolve o remetente', () => {
    const linhas = etiqueta([
      ['Felipe Oliveira Camargo', 'Av. Antonio Candido 1500'],
      ['Ester de Lemos Guimarães (TXGRUPPI)', 'Endereço: Avenida Barão do Rio Branco 2288'],
    ]).map((l) => ({
      ...l,
      box: [0, 0, 0, 0] as [number, number, number, number],
    }));

    expect(extrairComDiagnostico(linhas).campos.destinatario).toBe('FELIPE OLIVEIRA CAMARGO');
  });

  /**
   * Mercado Livre, remessa internacional. Mesmo formato da anterior, com a
   * diferença que importa: o complemento traz o tipo (`Sala 710`) e uma cauda de
   * texto livre que o remetente digitou, e a cauda não pode entrar no campo.
   *
   * Traz também a armadilha do NCM: `63049900` são oito dígitos seguidos na
   * declaração de alfândega, e viram `63049-900` para qualquer regex de CEP
   * desatenta.
   */
  it('Mercado Livre: "Complemento: Sala 710 Referencia: ..." e o NCM que parece CEP', () => {
    const { campos } = extrairComDiagnostico(
      etiqueta([
        [
          'shenzhenshilingruotamaoyiyouxi',
          'Youchang Pond 92 Shajing Sub-District',
          'Shenzhen CN GD 518015',
          'Pack ID: 2000013932818707',
        ],
        [
          'www.mercadolivre.com.br',
          'BRAZAR.COM BR LTDA',
          'Mercado Livre',
          'CNPJ 03.007.331/0001-41',
        ],
        ['474858 35458'],
        ['CNXGD1', 'BR_VM MG 13:00'],
        ['SMG2', '08:00'],
        ['CNXGD1 > BRCST2 > XSP2 > SMG2 > 33'],
        [
          'Declaração para Alfândega',
          'Cód NCM Descrição do Conteúdo Qtde Peso KG Unit BRL Valor BRL',
          '63049900 1 - Protetor De Colchao... 1 0,50 50,51 50,51',
        ],
        [
          'Hergisson Pereira da Costa',
          '(SHEILARAKAUSKAS)',
          'CPF: 53062515600',
          'Endereço: Avenida Barão do Rio Branco 2288, Centro',
          'CEP: 36016901',
          'Cidade de destino: . Minas Gerais',
          'Complemento: Sala 710 Referencia: Próximo ao Parque',
        ],
      ]),
    );

    expect(campos).toMatchObject({
      destinatario: 'HERGISSON PEREIRA DA COSTA',
      endereco: 'AVENIDA BARAO DO RIO BRANCO 2288',
      complemento: 'SALA 710',
      numero: '710',
      bairro: 'CENTRO',
      // A cidade não imprimiu ("Cidade de destino: . Minas Gerais"). Devolver o
      // estado como se fosse a cidade seria inventar.
      cidade: null,
      uf: 'MG',
      cep: '36016-901',
      transportadora: 'Mercado Livre',
    });
  });

  /**
   * Shopee via Anjun Courier. O caso da **quebra de linha dentro do endereço**:
   *
   *     Avenida Barão do Rio Branco, 2288, Sala
   *     1205 ed solar do progress, Juiz de Fora,
   *
   * A palavra-chave termina uma linha e o número começa a seguinte. A defesa do
   * parser contra o blob global (`ESPACO`, que não atravessa `\n`) é exatamente
   * o que jogava a sala fora — e ela continua valendo em todo o resto da
   * etiqueta. Dentro da zona de destino a quebra é artefato da largura do papel,
   * e só ali ela é desfeita.
   *
   * A etiqueta traz ainda o endereço de devolução completo, com CEP de outro
   * estado, que não pode disputar nada.
   */
  it('Shopee: unidade partida entre duas linhas do endereço', () => {
    const { campos } = extrairComDiagnostico(
      etiqueta([
        [
          'Shopee',
          'client id : 24018',
          'SHPS TECNOLOGIA E SERVICOS LTDA.',
          'CNPJ: 35.635.824/0001-12',
          'Order #: BR261858279308U',
        ],
        ['Serviço: Express', 'Taxpayment Method: PRC', 'https://shopee.com.br'],
        ['AJ260709115803401'],
        ['36026500'],
        [
          'DESTINATARIO',
          'DEBORA ARRUDA DA SILVA',
          'Avenida Barão do Rio Branco, 2288, Sala',
          '1205 ed solar do progress, Juiz de Fora,',
          'Minas Gerais',
        ],
        ['MG-W-A005'],
        ['Alto dos Passos', 'Juiz de Fora', 'Minas Gerais'],
        ['Remetente:', 'Leia.Sun'],
        ['Instrução do Remetente no caso de não nacionalização:', 'Retorno à origem'],
        [
          'DEVOLUÇÃO(em caso de nacionalização)',
          '(Em caso de não entrega encaminhar para):',
          'Av. Júlia Gaioli, 740 - Água Chata,',
          'Guarulhos - SP, 07251-500',
        ],
      ]),
    );

    expect(campos).toMatchObject({
      destinatario: 'DEBORA ARRUDA DA SILVA',
      endereco: 'AVENIDA BARAO DO RIO BRANCO, 2288',
      complemento: 'SALA 1205',
      numero: '1205',
      cidade: 'JUIZ DE FORA',
      uf: 'MG',
      transportadora: 'Shopee',
    });
    // O CEP da devolução (Guarulhos) fica de fora: o bloco inteiro sai da
    // frente antes da varredura.
    expect(campos.cep).toBe('36026-500');
  });

  /**
   * Shopee direto. Duas armadilhas de uma vez:
   *
   * - `2288, 2288` — o número da rua impresso duas vezes. Aceitar "parte com
   *   dígito depois do logradouro" como complemento devolvia `2288` no lugar da
   *   sala. Só palavra-chave promove uma parte a complemento.
   * - **Dois `CEP:` rotulados**, o do destino e o do remetente. O do remetente
   *   está a três blocos de distância e num bloco declarado como dele.
   */
  it('Shopee: número da rua repetido e dois CEP rotulados', () => {
    const { campos } = extrairComDiagnostico(
      etiqueta([
        ['Shopee'],
        [
          'DESTINATARIO',
          'Beatriz Regina Honório De Assis',
          'Avenida Barão do Rio Branco 2288, 2288, Solar do',
          'progresso sala 1502. Juiz de Fora, Minas Gerais',
          'Bairro: Centro',
          'CEP: 36016-901',
          'Pedido: 260722AFE5JYCJ',
        ],
        ['RJ2 -2'],
        ['LMG-59'],
        ['Juiz de Fora'],
        ['COLETA'],
        ['BR2658641784721'],
        [
          'REMETENTE',
          'Equipe Multvendas Ltda.',
          'Rua Padre Agostinho Poncet, 67, Casa, São Paulo',
          'CEP: 02408040',
          'Envio previsto: 22/07/2026',
        ],
      ]),
    );

    expect(campos).toMatchObject({
      destinatario: 'BEATRIZ REGINA HONORIO DE ASSIS',
      endereco: 'AVENIDA BARAO DO RIO BRANCO 2288',
      complemento: 'SALA 1502',
      numero: '1502',
      bairro: 'CENTRO',
      cidade: 'JUIZ DE FORA',
      uf: 'MG',
      cep: '36016-901',
      transportadora: 'Shopee',
      codigoRastreio: 'BR2658641784721',
    });
  });

  /**
   * O endereço cadastrado do condomínio como âncora.
   *
   * Esta etiqueta não tem rótulo nenhum e imprime **dois** blocos com cara de
   * endereço de entrega — o do remetente e o do destino. É o formato que mais
   * aparece em transportadora regional, e sem uma referência externa não há como
   * escolher: os dois têm nome de pessoa, rua, número e CEP.
   *
   * O condomínio sabe o próprio CEP. É o único sinal na etiqueta que não é
   * heurística.
   */
  describe('âncora do condomínio', () => {
    const linhas = etiqueta([
      ['Joao Pedro Alves', 'Endereço: Rua das Acácias 45', 'CEP: 04567-000', 'Complemento: Casa 2'],
      [
        'Carla Mendes Rocha',
        'Endereço: Avenida Barão do Rio Branco 2288',
        'CEP: 36016-901',
        'Complemento: Sala 803',
      ],
    ]);

    it('sem o condomínio cadastrado, os dois blocos empatam', () => {
      const { campos, camposFracos } = extrairComDiagnostico(linhas);
      expect(campos.destinatario).toBe('JOAO PEDRO ALVES');
      // Empate de certeza é o que faz os dois blocos virarem uma zona só —
      // resultado ruim, mas declarado: o campo sai marcado como fraco.
      expect(camposFracos).toContain('destinatario');
    });

    it('com o CEP do condomínio, o bloco certo ganha', () => {
      const { campos, camposFracos } = extrairComDiagnostico(linhas, {
        condominio: {
          cep: '36016901',
          endereco: 'Avenida Barão do Rio Branco, 2288',
        },
      });

      expect(campos).toMatchObject({
        destinatario: 'CARLA MENDES ROCHA',
        endereco: 'AVENIDA BARAO DO RIO BRANCO 2288',
        complemento: 'SALA 803',
        numero: '803',
        cep: '36016-901',
      });
      expect(camposFracos).toHaveLength(0);
    });
  });
});
