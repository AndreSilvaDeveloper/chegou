import type { AssinaturaFatura } from '../../database/entities';
import {
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';
import { situacaoDePagamento } from './situacao-pagamento';

/**
 * O que o cliente vê sobre a cobrança.
 *
 * A régua inteira é pura, então mora aqui e não no e2e — lá as faturas mudam de
 * estado ao longo da suíte, e um teste que dependesse dessa ordem quebraria
 * sozinho na primeira vez que alguém acrescentasse um caso no meio.
 */
const fatura = (over: Partial<AssinaturaFatura>): AssinaturaFatura =>
  ({
    status: StatusFatura.ABERTA,
    cobrancaStatus: StatusCobranca.PENDENTE,
    invoiceUrl: null,
    ...over,
  }) as AssinaturaFatura;

describe('situacaoDePagamento', () => {
  it('emitida com link é pagável', () => {
    const r = situacaoDePagamento(
      fatura({ cobrancaStatus: StatusCobranca.EMITIDA, invoiceUrl: 'https://asaas.com/i/1' }),
    );

    expect(r).toEqual({ situacao: 'pagavel', linkPagamento: 'https://asaas.com/i/1' });
  });

  it.each([
    ['paga', StatusFatura.PAGA],
    ['cancelada', StatusFatura.CANCELADA],
    ['estornada', StatusFatura.ESTORNADA],
  ])('fatura %s não oferece pagamento, mesmo com link gravado', (_nome, status) => {
    // O `invoiceUrl` continua na linha depois da baixa. Se a pergunta "tem
    // link?" viesse antes de "já está resolvida?", a tela mostraria "Pagar"
    // numa fatura paga — convidando o cliente a pagar duas vezes.
    const r = situacaoDePagamento(
      fatura({
        status,
        cobrancaStatus: StatusCobranca.EMITIDA,
        invoiceUrl: 'https://asaas.com/i/1',
      }),
    );

    expect(r).toEqual({ situacao: 'sem_pendencia', linkPagamento: null });
  });

  it.each([
    ['pendente', StatusCobranca.PENDENTE],
    ['desligada', StatusCobranca.DESLIGADA],
  ])('cobrança %s é "preparando", não erro', (_nome, cobrancaStatus) => {
    // Dizer "indisponível" aqui faria o cliente ligar para o suporte por causa
    // de uma emissão que ia terminar em segundos.
    expect(situacaoDePagamento(fatura({ cobrancaStatus }))).toEqual({
      situacao: 'preparando',
      linkPagamento: null,
    });
  });

  it('erro na emissão manda falar com o suporte', () => {
    expect(situacaoDePagamento(fatura({ cobrancaStatus: StatusCobranca.ERRO }))).toEqual({
      situacao: 'indisponivel',
      linkPagamento: null,
    });
  });

  it('emitida SEM link também é indisponível — não há o que abrir', () => {
    expect(
      situacaoDePagamento(fatura({ cobrancaStatus: StatusCobranca.EMITIDA, invoiceUrl: null })),
    ).toEqual({ situacao: 'indisponivel', linkPagamento: null });
  });

  it('fatura vencida ainda é pagável — atraso não tira o link', () => {
    const r = situacaoDePagamento(
      fatura({
        status: StatusFatura.VENCIDA,
        cobrancaStatus: StatusCobranca.EMITIDA,
        invoiceUrl: 'https://asaas.com/i/1',
      }),
    );

    expect(r.situacao).toBe('pagavel');
  });

  it('**em disputa NÃO oferece pagamento**, mesmo com link vivo', () => {
    // Pagar no meio de um chargeback é como se paga duas vezes: se a disputa
    // for resolvida a nosso favor o valor volta, e o cliente terá pago o mesmo
    // mês duas vezes. Não é `sem_pendencia` (há dinheiro em jogo) nem
    // `pagavel` — chargeback se resolve com gente, não com botão.
    const r = situacaoDePagamento(
      fatura({
        status: StatusFatura.EM_DISPUTA,
        cobrancaStatus: StatusCobranca.EMITIDA,
        invoiceUrl: 'https://asaas.com/i/1',
      }),
    );

    expect(r).toEqual({ situacao: 'indisponivel', linkPagamento: null });
  });
});
