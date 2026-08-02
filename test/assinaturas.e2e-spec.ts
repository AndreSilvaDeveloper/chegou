import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AssinaturaFaturasService } from '../src/modules/assinaturas/assinatura-faturas.service';
import { AssinaturasService } from '../src/modules/assinaturas/assinaturas.service';
import { AssinaturaCobrancasService } from '../src/modules/assinaturas/assinatura-cobrancas.service';
import { TipoClienteAssinatura } from '../src/database/entities/assinatura-faixa.entity';

/**
 * Assinatura: a conta que o cliente paga.
 *
 * O cálculo puro está coberto em `calculadora-assinatura.spec.ts`. Aqui o que
 * se prova é o **SQL**: quem é o sacado, quais condomínios entram na conta,
 * quais apartamentos contam e qual preço especial está em vigor.
 *
 * O cenário monta uma administradora com dois condomínios (30 + 25 unidades)
 * que, somados, formam a base da carteira — é a regra de que o condomínio de
 * carteira não é cobrado sozinho.
 *
 * **São duas tabelas de preço**, uma por tipo de cliente: o condomínio direto
 * anda pelas faixas de volume (3,99 até 100 · 3,49 até 200 · 2,99 acima) e a
 * administradora paga o preço de atacado (1,99, faixa única). Toda expectativa
 * de valor aqui embaixo depende de qual das duas o cliente usa — é justamente o
 * que este arquivo existe para provar.
 */
describe('Assinaturas — cálculo sobre o banco (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let service: AssinaturasService;
  let faturas: AssinaturaFaturasService;
  let cobrancas: AssinaturaCobrancasService;

  /** Competência distante: a geração varre o banco inteiro, então não pode
   *  esbarrar em fatura de dado real nem de outra rodada. */
  const COMPETENCIA = '2099-01';

  const sufixo = Date.now().toString(36).slice(-5).toUpperCase();
  let administradoraId: string;
  let tenantA: string;
  let tenantB: string;
  let tenantDireto: string;

  const criarTenant = async (nome: string, admId: string | null): Promise<string> => {
    const [row] = await ds.query(
      `INSERT INTO tenants (nome, slug, administradora_id, ativo, plano)
       VALUES ($1, $2, $3, true, 'basico') RETURNING id`,
      [nome, `${nome.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, admId],
    );
    return row.id as string;
  };

  /** `inicio` evita colidir com o índice (tenant, bloco, numero) ao criar outro lote. */
  const criarApartamentos = async (
    tenantId: string,
    quantidade: number,
    ativos = true,
    inicio = 1,
  ) => {
    const valores = Array.from(
      { length: quantidade },
      (_, i) => `('${tenantId}', '${inicio + i}', ${ativos})`,
    );
    await ds.query(`INSERT INTO apartamentos (tenant_id, numero, ativo) VALUES ${valores.join(',')}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get(DataSource);
    service = app.get(AssinaturasService);
    faturas = app.get(AssinaturaFaturasService);
    cobrancas = app.get(AssinaturaCobrancasService);

    const [adm] = await ds.query(
      `INSERT INTO administradoras (nome, ativo) VALUES ($1, true) RETURNING id`,
      [`E2E Assinatura ${sufixo}`],
    );
    administradoraId = adm.id;

    tenantA = await criarTenant(`e2e-assin-a-${sufixo}`, administradoraId);
    tenantB = await criarTenant(`e2e-assin-b-${sufixo}`, administradoraId);
    tenantDireto = await criarTenant(`e2e-assin-d-${sufixo}`, null);

    await criarApartamentos(tenantA, 30);
    await criarApartamentos(tenantB, 25);
    await criarApartamentos(tenantDireto, 10);
    // Unidade desativada não pode entrar na conta.
    await criarApartamentos(tenantDireto, 5, false, 101);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      // Os itens caem por CASCADE junto com a fatura.
      await ds.query('DELETE FROM assinatura_faturas WHERE competencia = $1', [`${COMPETENCIA}-01`]);
      for (const id of [tenantA, tenantB, tenantDireto].filter(Boolean)) {
        await ds.query('DELETE FROM assinatura_condicoes WHERE tenant_id = $1', [id]);
        await ds.query('DELETE FROM apartamentos WHERE tenant_id = $1', [id]);
        await ds.query('DELETE FROM tenants WHERE id = $1', [id]);
      }
      if (administradoraId) {
        await ds.query('DELETE FROM assinatura_condicoes WHERE administradora_id = $1', [administradoraId]);
        await ds.query('DELETE FROM administradoras WHERE id = $1', [administradoraId]);
      }
    }
    await app?.close();
  });

  it('a carteira soma os condomínios e usa a tabela da administradora', async () => {
    const previa = await service.previaDaAdministradora(administradoraId);

    // 30 + 25 = 55 unidades na carteira, ao preço de atacado de R$ 1,99.
    // A soma continua sendo a base da contagem — hoje ela não muda o preço
    // unitário porque a tabela da administradora tem faixa única, mas é ela que
    // decidiria a faixa no dia em que essa tabela escalonar por volume.
    expect(previa.resultado.quantidadeApartamentos).toBe(55);
    expect(previa.resultado.precoAplicado).toBe(1.99);
    expect(previa.resultado.valor).toBe(109.45);
    expect(previa.resultado.itens).toHaveLength(2);
  });

  it('cada condomínio da carteira aparece na composição', async () => {
    const previa = await service.previaDaAdministradora(administradoraId);
    const porNome = Object.fromEntries(previa.resultado.itens.map((i) => [i.nome, i]));

    expect(porNome[`e2e-assin-a-${sufixo}`].apartamentos).toBe(30);
    expect(porNome[`e2e-assin-b-${sufixo}`].apartamentos).toBe(25);
    expect(porNome[`e2e-assin-a-${sufixo}`].subtotal).toBe(59.7); // 30 × 1,99
  });

  it('apartamento desativado não conta', async () => {
    const previa = await service.previaDoCondominio(tenantDireto);

    // 10 ativos + 5 desativados → cobra 10.
    expect(previa.resultado.quantidadeApartamentos).toBe(10);
    expect(previa.resultado.valor).toBe(39.9); // 10 × 3,99
  });

  it('condomínio de carteira não gera cobrança própria', async () => {
    const previas = await service.listarPrevias();
    const nomes = previas.map((p) => p.sacado.nome);

    expect(nomes).toContain(`E2E Assinatura ${sufixo}`); // a administradora, sim
    expect(nomes).not.toContain(`e2e-assin-a-${sufixo}`); // o condomínio dela, não
    expect(nomes).toContain(`e2e-assin-d-${sufixo}`); // o direto, sim
  });

  it('diz quem é o responsável pela cobrança de cada condomínio', async () => {
    await expect(service.responsavelPeloCondominio(tenantDireto)).resolves.toMatchObject({
      via: 'condominio',
    });
    await expect(service.responsavelPeloCondominio(tenantA)).resolves.toMatchObject({
      via: 'administradora',
      administradoraId,
    });
  });

  it('preço especial em vigor substitui a tabela', async () => {
    await ds.query(
      `INSERT INTO assinatura_condicoes (administradora_id, modo, preco_apartamento, vigente_de, observacao)
       VALUES ($1, 'preco_apartamento', 2.00, CURRENT_DATE - 1, 'e2e')`,
      [administradoraId],
    );

    const previa = await service.previaDaAdministradora(administradoraId);
    expect(previa.resultado.precoAplicado).toBe(2);
    expect(previa.resultado.valor).toBe(110); // 55 × 2,00
    expect(previa.condicao?.modo).toBe('preco_apartamento');

    await ds.query('DELETE FROM assinatura_condicoes WHERE administradora_id = $1', [administradoraId]);
  });

  it('condição vencida não vale mais', async () => {
    await ds.query(
      `INSERT INTO assinatura_condicoes (administradora_id, modo, preco_apartamento, vigente_de, vigente_ate, observacao)
       VALUES ($1, 'preco_apartamento', 1.00, CURRENT_DATE - 30, CURRENT_DATE - 1, 'e2e vencida')`,
      [administradoraId],
    );

    const previa = await service.previaDaAdministradora(administradoraId);
    expect(previa.resultado.precoAplicado).toBe(1.99); // voltou para a tabela dela
    expect(previa.condicao).toBeNull();

    await ds.query('DELETE FROM assinatura_condicoes WHERE administradora_id = $1', [administradoraId]);
  });

  // ------------------------------------------------------------ preço especial

  describe('preço especial pelo service', () => {
    afterEach(async () => {
      await ds.query('DELETE FROM assinatura_condicoes WHERE administradora_id = $1 OR tenant_id = $2', [
        administradoraId,
        tenantDireto,
      ]);
    });

    it('recusa condição em condomínio que quem paga é a administradora', async () => {
      await expect(
        service.criarCondicao({ tenantId: tenantA, modo: 'preco_apartamento' as any, precoApartamento: 2 }),
      ).rejects.toThrow(/administradora/i);
    });

    it('exige exatamente um cliente', async () => {
      await expect(
        service.criarCondicao({
          tenantId: tenantDireto,
          administradoraId,
          modo: 'tabela' as any,
        }),
      ).rejects.toThrow(/um dos dois/i);
    });

    it('criar uma condição nova encerra a anterior na véspera', async () => {
      await service.criarCondicao({
        administradoraId,
        modo: 'preco_apartamento' as any,
        precoApartamento: 2,
        vigenteDe: '2026-01-01',
      });
      await service.criarCondicao({
        administradoraId,
        modo: 'valor_fixo' as any,
        valorFixo: 500,
        vigenteDe: '2026-06-01',
      });

      const lista = await service.listarCondicoes({ administradoraId });
      expect(lista).toHaveLength(2);

      const antiga = lista.find((c) => c.vigenteDe === '2026-01-01');
      const nova = lista.find((c) => c.vigenteDe === '2026-06-01');
      expect(antiga?.vigenteAte).toBe('2026-05-31');
      expect(nova?.vigenteAte).toBeNull();
    });

    it('recusa condição que começa antes da que está em aberto', async () => {
      await service.criarCondicao({
        administradoraId,
        modo: 'valor_fixo' as any,
        valorFixo: 500,
        vigenteDe: '2026-06-01',
      });

      await expect(
        service.criarCondicao({
          administradoraId,
          modo: 'valor_fixo' as any,
          valorFixo: 100,
          vigenteDe: '2026-03-01',
        }),
      ).rejects.toThrow(/precisa começar depois/i);
    });
  });

  // ------------------------------------------------------------------ faturas

  describe('faturas do mês', () => {
    it('gera uma fatura por sacado, com a composição da carteira', async () => {
      const resultado = await faturas.gerar({ competencia: COMPETENCIA });
      expect(resultado.competencia).toBe(`${COMPETENCIA}-01`);

      const daAdm = resultado.faturas.find((f) => f.administradoraId === administradoraId);
      const doDireto = resultado.faturas.find((f) => f.tenantId === tenantDireto);

      expect(daAdm?.valor).toBe(109.45); // 55 × 1,99 (tabela da administradora)
      expect(daAdm?.quantidadeApartamentos).toBe(55);
      expect(daAdm?.itens).toHaveLength(2); // um item por condomínio da carteira
      expect(daAdm?.sacado.tipo).toBe('administradora');

      expect(doDireto?.valor).toBe(39.9); // 10 × 3,99 (tabela do condomínio)
      expect(doDireto?.itens).toHaveLength(1);

      // O condomínio de carteira não tem fatura própria: já está na da carteira.
      expect(resultado.faturas.some((f) => f.tenantId === tenantA)).toBe(false);
    });

    it('a soma dos itens bate com o total da fatura', async () => {
      const [fatura] = await faturas.listar({
        competencia: COMPETENCIA,
        administradoraId,
      });
      const soma = fatura.itens.reduce((acc, i) => acc + Number(i.subtotal), 0);
      expect(Number(soma.toFixed(2))).toBe(fatura.valorBruto);
    });

    it('gerar de novo não duplica', async () => {
      const antes = (await faturas.listar({ competencia: COMPETENCIA })).length;
      const resultado = await faturas.gerar({ competencia: COMPETENCIA });
      const depois = (await faturas.listar({ competencia: COMPETENCIA })).length;

      expect(resultado.criadas).toBe(0);
      expect(resultado.jaExistiam).toBeGreaterThanOrEqual(2);
      expect(depois).toBe(antes);
    });

    it('a fatura é fotografia: mexer na tabela de preços não reescreve o passado', async () => {
      const [antes] = await faturas.listar({ competencia: COMPETENCIA, administradoraId });

      await service.definirFaixas(TipoClienteAssinatura.ADMINISTRADORA, {
        faixas: [{ ateQuantidade: 50, precoApartamento: 9.99 }, { precoApartamento: 8.99 }],
      });
      const [depois] = await faturas.listar({ competencia: COMPETENCIA, administradoraId });

      expect(depois.valor).toBe(antes.valor);
      expect(depois.precoAplicado).toBe(1.99);

      // Devolve a tabela original — o banco é compartilhado com os outros testes.
      await service.definirFaixas(TipoClienteAssinatura.ADMINISTRADORA, {
        faixas: [{ precoApartamento: 1.99 }],
      });
    });

    it('trocar a tabela de um tipo não apaga a do outro', async () => {
      // A limpeza da substituição é filtrada pelo `tipo_cliente`. Sem esse
      // filtro ela varreria `assinatura_faixas` inteira, e o próximo cliente do
      // outro tipo cairia em "não há faixas cadastradas" no fechamento do mês —
      // silenciosamente, um mês depois de alguém editar preço.
      await service.definirFaixas(TipoClienteAssinatura.ADMINISTRADORA, {
        faixas: [{ precoApartamento: 1.49 }],
      });

      const doCondominio = await service.faixas(TipoClienteAssinatura.CONDOMINIO);
      expect(doCondominio).toHaveLength(3);
      expect(doCondominio[0].precoApartamento).toBe(3.99);

      await service.definirFaixas(TipoClienteAssinatura.ADMINISTRADORA, {
        faixas: [{ precoApartamento: 1.99 }],
      });
    });

    it('recusa tabela de preços sem faixa aberta no topo', async () => {
      await expect(
        service.definirFaixas(TipoClienteAssinatura.CONDOMINIO, {
          faixas: [{ ateQuantidade: 50, precoApartamento: 3.99 }],
        }),
      ).rejects.toThrow(/última faixa não pode ter teto/i);
    });

    it('dar baixa marca paga e não aceita duas vezes', async () => {
      const [fatura] = await faturas.listar({ competencia: COMPETENCIA, tenantId: tenantDireto });

      const paga = await faturas.pagar(fatura.id, { formaPagamento: 'pix' });
      expect(paga.status).toBe('paga');
      expect(paga.pagaEm).toBeTruthy();

      await expect(faturas.pagar(fatura.id, {})).rejects.toThrow(/já está paga/i);
      await expect(faturas.cancelar(fatura.id, {})).rejects.toThrow(/não pode ser cancelada/i);
    });

    it('cancelar tira a fatura dos totais', async () => {
      const [fatura] = await faturas.listar({ competencia: COMPETENCIA, administradoraId });
      const antes = await faturas.resumo(COMPETENCIA);

      const cancelada = await faturas.cancelar(fatura.id, { motivo: 'e2e' });
      expect(cancelada.status).toBe('cancelada');
      expect(cancelada.observacao).toBe('e2e');

      // Cancelada não foi cobrada e não é dívida: sai do faturado e do em aberto.
      const depois = await faturas.resumo(COMPETENCIA);
      expect(depois.valorFaturado).toBeCloseTo(antes.valorFaturado - fatura.valor, 2);
      expect(depois.valorEmAberto).toBeCloseTo(antes.valorEmAberto - fatura.valor, 2);
    });
  });

  // ------------------------------------------------------------------ cobrança

  describe('cobrança no gateway', () => {
    /**
     * Sem `PAYMENT_API_BASE_URL` a integração está desligada, e é assim que o
     * e2e roda. O que se prova aqui é justamente que **a fatura nasce igual**:
     * gateway ausente não pode custar faturamento.
     */
    it('a fatura nasce mesmo com a cobrança desligada', async () => {
      const [fatura] = await faturas.listar({ competencia: COMPETENCIA, tenantId: tenantDireto });

      expect(fatura.valor).toBeGreaterThan(0);
      // Sem gateway configurado, a emissão nunca sai de pendente/desligada — e
      // nenhum dos dois é erro.
      expect(['pendente', 'desligada']).toContain(fatura.cobrancaStatus);
      expect(fatura.cobrancaId).toBeNull();
    });

    it('toda fatura chega ao cliente com a situação de pagamento resolvida', async () => {
      const todas = await faturas.listar({ competencia: COMPETENCIA });

      // O cliente não vê `cobranca_status` nem o status bruto do gateway: ele
      // vê uma resposta só. Nenhuma fatura pode chegar à tela sem ela — seria
      // uma linha da lista sem saber se oferece "Pagar" ou não.
      // (A régua de qual situação sai de qual estado é unitária, em
      // `situacao-pagamento.spec.ts`: aqui as faturas já mudaram de estado nos
      // testes acima, e depender dessa ordem tornaria o teste frágil.)
      for (const fatura of todas) {
        expect(fatura.pagamento).toBeDefined();
        expect(typeof fatura.pagamento.situacao).toBe('string');
        // Sem gateway ninguém tem link, em nenhum estado.
        expect(fatura.pagamento.linkPagamento).toBeNull();
      }
    });

    it('emitir com o gateway desligado não inventa cobrança', async () => {
      const [fatura] = await faturas.listar({ competencia: COMPETENCIA, tenantId: tenantDireto });

      const r = await cobrancas.emitir(fatura.id);

      expect(r.ok).toBe(false);
      expect(r.cobrancaId).toBeNull();
      expect(r.status).toBe('desligada');
    });

    it('fatura paga não oferece pagamento', async () => {
      // A de tenantDireto já foi paga no bloco anterior de baixa manual.
      const pagas = await faturas.listar({ competencia: COMPETENCIA, status: 'paga' as never });
      const paga = pagas[0];
      if (!paga) return;

      expect(paga.pagamento.situacao).toBe('sem_pendencia');
      expect(paga.pagamento.linkPagamento).toBeNull();
    });
  });
});
