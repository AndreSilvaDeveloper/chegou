import type { Repository } from 'typeorm';
import { AssinaturaFatura } from '../../database/entities';
import {
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';
import type { AuditService } from '../../common/audit/audit.service';
import type { CobrancasService } from '../pagamentos/cobrancas.service';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import { ConciliacaoService } from './conciliacao.service';

/**
 * A conciliação: o webhook que se perdeu.
 *
 * O que se prova aqui é que ela **alcança o que o evento não trouxe** e que
 * divergência de valor **nunca é corrigida em silêncio** — um alarme falso
 * mensal é a maneira mais rápida de ninguém mais olhar para os alarmes, e um
 * ajuste silencioso é pior ainda.
 */
class RepoFake {
  constructor(public faturas: AssinaturaFatura[]) {}

  async find() {
    return this.faturas;
  }

  async update(id: string, campos: Partial<AssinaturaFatura>) {
    const f = this.faturas.find((x) => x.id === id);
    if (f) Object.assign(f, campos);
    return { affected: 1 };
  }
}

const fatura = (over: Partial<AssinaturaFatura> = {}): AssinaturaFatura =>
  ({
    id: 'fatura-1',
    valor: 418.8,
    status: StatusFatura.ABERTA,
    pagaEm: null,
    cobrancaId: '5030',
    cobrancaStatus: StatusCobranca.EMITIDA,
    cobrancaDessincronizada: false,
    ...over,
  }) as AssinaturaFatura;

describe('ConciliacaoService', () => {
  let repo: RepoFake;
  let cobrancas: { ligado: boolean; consultar: jest.Mock };
  let audit: { log: jest.Mock };
  let service: ConciliacaoService;

  const montar = (faturas: AssinaturaFatura[]) => {
    repo = new RepoFake(faturas);
    const faturaCobrancas = new AssinaturaCobrancasService(
      repo as unknown as Repository<AssinaturaFatura>,
      cobrancas as unknown as CobrancasService,
      { vinculoDe: jest.fn() } as never,
      { ativo: false, situacao: jest.fn(), esquecer: jest.fn() } as never,
      { resolver: jest.fn().mockResolvedValue(null) } as never,
      { log: jest.fn() } as never,
    );
    service = new ConciliacaoService(
      repo as unknown as Repository<AssinaturaFatura>,
      cobrancas as unknown as CobrancasService,
      faturaCobrancas,
      audit as unknown as AuditService,
    );
  };

  beforeEach(() => {
    cobrancas = { ligado: true, consultar: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
  });

  it('não roda com o gateway desligado', async () => {
    cobrancas.ligado = false;
    montar([fatura()]);

    const r = await service.conciliar();

    expect(r.ligada).toBe(false);
    expect(cobrancas.consultar).not.toHaveBeenCalled();
  });

  it('**alcança a baixa que o webhook perdeu**', async () => {
    montar([fatura()]);
    cobrancas.consultar.mockResolvedValue({ statusGateway: 'RECEIVED', valor: 418.8 });

    const r = await service.conciliar();

    expect(repo.faturas[0].status).toBe(StatusFatura.PAGA);
    expect(repo.faturas[0].pagaEm).toBeInstanceOf(Date);
    expect(r.divergentes).toBe(1);
    expect(r.detalhes[0]).toEqual({ faturaId: 'fatura-1', de: 'aberta', para: 'paga' });
  });

  it('registra a divergência no audit_log, com o antes e o depois', async () => {
    montar([fatura()]);
    cobrancas.consultar.mockResolvedValue({ statusGateway: 'RECEIVED', valor: 418.8 });

    await service.conciliar();

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'assinatura.conciliacao.status',
        diffJson: expect.objectContaining({ de: 'aberta', para: 'paga' }),
      }),
    );
  });

  it('estado igual não gera ruído', async () => {
    montar([fatura()]);
    cobrancas.consultar.mockResolvedValue({ statusGateway: 'PENDING', valor: 418.8 });

    const r = await service.conciliar();

    expect(r.divergentes).toBe(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('**pula o que já é terminal** — cancelada e estornada não se movem mais', async () => {
    montar([
      fatura({ id: 'f-cancelada', status: StatusFatura.CANCELADA }),
      fatura({ id: 'f-estornada', status: StatusFatura.ESTORNADA }),
    ]);

    const r = await service.conciliar();

    expect(r.conferidas).toBe(0);
    expect(cobrancas.consultar).not.toHaveBeenCalled();
  });

  it('**paga NÃO é terminal**: continua sendo conferida', async () => {
    // Estorno e chargeback chegam depois da baixa, e é justamente o caso em que
    // perder o webhook custa caro — o cliente aparece adimplente com o dinheiro
    // já devolvido.
    montar([fatura({ status: StatusFatura.PAGA, pagaEm: new Date() })]);
    cobrancas.consultar.mockResolvedValue({ statusGateway: 'REFUNDED', valor: 418.8 });

    const r = await service.conciliar();

    expect(r.conferidas).toBe(1);
    expect(repo.faturas[0].status).toBe(StatusFatura.ESTORNADA);
  });

  it('**divergência de valor é alarme, nunca correção**', async () => {
    montar([fatura()]);
    cobrancas.consultar.mockResolvedValue({ statusGateway: 'PENDING', valor: 376.92 });

    await service.conciliar();

    // A fatura é a fonte da verdade do que o cliente deve. Ajustar em silêncio
    // esconderia exatamente o que precisa ser visto.
    expect(repo.faturas[0].valor).toBe(418.8);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'assinatura.conciliacao.valor_divergente',
        diffJson: { nosso: 418.8, gateway: 376.92 },
      }),
    );
  });

  it('falha numa fatura não derruba o lote', async () => {
    montar([fatura({ id: 'f-1' }), fatura({ id: 'f-2' })]);
    cobrancas.consultar
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ statusGateway: 'RECEIVED', valor: 418.8 });

    const r = await service.conciliar();

    expect(r.falhas).toBe(1);
    expect(r.divergentes).toBe(1);
    expect(repo.faturas[1].status).toBe(StatusFatura.PAGA);
  });

  it('confirmar o estado limpa a marca de dessincronizada', async () => {
    montar([fatura({ cobrancaDessincronizada: true, status: StatusFatura.PAGA, pagaEm: new Date() })]);
    cobrancas.consultar.mockResolvedValue({ statusGateway: 'RECEIVED', valor: 418.8 });

    await service.conciliar();

    // A baixa que não tinha chegado ao gateway chegou (ou a informação de lá é
    // a que vale). De um jeito ou de outro, não há mais o que reconciliar.
    expect(repo.faturas[0].cobrancaDessincronizada).toBe(false);
  });
});
