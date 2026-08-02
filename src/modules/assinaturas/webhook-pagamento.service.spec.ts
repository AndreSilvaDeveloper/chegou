import { QueryFailedError, type Repository } from 'typeorm';
import { AssinaturaFatura, AssinaturaWebhookEvento } from '../../database/entities';
import {
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';
import { StatusWebhookEvento } from '../../database/entities/assinatura-webhook-evento.entity';
import type { AuditService } from '../../common/audit/audit.service';
import type { CobrancasService } from '../pagamentos/cobrancas.service';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import { WebhookPagamentoService } from './webhook-pagamento.service';

/**
 * O dinheiro chegando.
 *
 * Três regras justificam este arquivo, e cada uma já custou dinheiro a alguém
 * em algum sistema: **evento repetido não dá baixa duas vezes**, **evento fora
 * de ordem não desfaz uma baixa**, e **evento de fatura desconhecida não
 * quebra**.
 */

class EventoRepoFake {
  readonly linhas: AssinaturaWebhookEvento[] = [];
  private readonly ids = new Set<string>();

  create(dados: Partial<AssinaturaWebhookEvento>) {
    return { id: `linha-${this.linhas.length + 1}`, tentativas: 0, ...dados } as AssinaturaWebhookEvento;
  }

  async save(linha: AssinaturaWebhookEvento) {
    // O índice único do banco, reproduzido: é ELE que resolve a corrida entre
    // duas entregas simultâneas — uma consulta antes do insert deixaria as duas
    // passarem.
    if (this.ids.has(linha.eventoId)) {
      throw Object.assign(new QueryFailedError('insert', [], new Error('dup')), { code: '23505' });
    }
    this.ids.add(linha.eventoId);
    this.linhas.push(linha);
    return linha;
  }

  async update(id: string, campos: Partial<AssinaturaWebhookEvento>) {
    const linha = this.linhas.find((l) => l.id === id);
    if (linha) Object.assign(linha, campos);
    return { affected: 1 };
  }
}

class FaturaRepoFake {
  constructor(public fatura: AssinaturaFatura | null) {}

  async findOne({ where }: { where: Record<string, unknown> }) {
    if (!this.fatura) return null;
    const f = this.fatura as unknown as Record<string, unknown>;
    return Object.entries(where).every(([k, v]) => f[k] === v) ? this.fatura : null;
  }
}

const fatura = (over: Partial<AssinaturaFatura> = {}): AssinaturaFatura =>
  ({
    id: 'fatura-1',
    tenantId: 'tenant-1',
    administradoraId: null,
    valor: 418.8,
    status: StatusFatura.ABERTA,
    pagaEm: null,
    cobrancaId: '5030',
    cobrancaAsaasId: 'pay_1',
    cobrancaStatus: StatusCobranca.EMITIDA,
    cobrancaDessincronizada: false,
    ...over,
  }) as AssinaturaFatura;

const eventoAsaas = (over: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  event: 'PAYMENT_RECEIVED',
  payment: { status: 'RECEIVED', externalReference: 'fatura-1', ...over },
});

describe('WebhookPagamentoService', () => {
  let eventos: EventoRepoFake;
  let faturas: FaturaRepoFake;
  let cobrancas: { ligado: boolean; consultar: jest.Mock };
  let audit: { log: jest.Mock };
  let service: WebhookPagamentoService;

  const montar = (f: AssinaturaFatura | null = fatura()) => {
    eventos = new EventoRepoFake();
    faturas = new FaturaRepoFake(f);
    const faturaCobrancas = new AssinaturaCobrancasService(
      faturas as unknown as Repository<AssinaturaFatura>,
      cobrancas as unknown as CobrancasService,
      { vinculoDe: jest.fn() } as never,
      { ativo: false, situacao: jest.fn(), esquecer: jest.fn() } as never,
      { resolver: jest.fn().mockResolvedValue(null) } as never,
      { log: jest.fn() } as never,
    );
    // O update da fatura passa pelo repo fake: basta refletir no objeto.
    (faturas as unknown as { update: jest.Mock }).update = jest
      .fn()
      .mockImplementation(async (_id, campos) => {
        if (faturas.fatura) Object.assign(faturas.fatura, campos);
        return { affected: 1 };
      });

    service = new WebhookPagamentoService(
      eventos as unknown as Repository<AssinaturaWebhookEvento>,
      faturas as unknown as Repository<AssinaturaFatura>,
      cobrancas as unknown as CobrancasService,
      faturaCobrancas,
      audit as unknown as AuditService,
    );
  };

  beforeEach(() => {
    cobrancas = { ligado: true, consultar: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    montar();
  });

  describe('deduplicação', () => {
    it('**evento repetido não dá baixa duas vezes**', async () => {
      const primeiro = await service.receber(eventoAsaas());
      expect(primeiro).toEqual({ aceito: true });
      expect(faturas.fatura!.status).toBe(StatusFatura.PAGA);

      // Repetição é normal: o remetente reenvia quando não recebe 200 a tempo.
      const pagaEmOriginal = faturas.fatura!.pagaEm;
      const segundo = await service.receber(eventoAsaas());

      expect(segundo).toEqual({ aceito: true, duplicado: true });
      expect(eventos.linhas).toHaveLength(1);
      expect(faturas.fatura!.pagaEm).toBe(pagaEmOriginal);
    });
  });

  describe('fora de ordem', () => {
    it('**`PENDING` atrasado não desfaz uma baixa**', async () => {
      await service.receber(eventoAsaas());
      expect(faturas.fatura!.status).toBe(StatusFatura.PAGA);

      // Evento antigo chegando depois: comparação é por precedência, nunca por
      // ordem de chegada.
      await service.receber({ ...eventoAsaas({ status: 'PENDING' }), id: 'evt_2' });

      expect(faturas.fatura!.status).toBe(StatusFatura.PAGA);
      expect(eventos.linhas[1].detalhe).toMatch(/sem mudança/i);
    });

    it('`RECEIVED` depois de `CONFIRMED` não muda nada — os dois são paga', async () => {
      await service.receber({ ...eventoAsaas({ status: 'CONFIRMED' }), id: 'evt_a' });
      const pagaEm = faturas.fatura!.pagaEm;

      await service.receber({ ...eventoAsaas({ status: 'RECEIVED' }), id: 'evt_b' });

      expect(faturas.fatura!.status).toBe(StatusFatura.PAGA);
      expect(faturas.fatura!.pagaEm).toBe(pagaEm);
    });

    it('estorno DEPOIS da baixa avança — é a informação mais nova', async () => {
      await service.receber(eventoAsaas());
      await service.receber({ ...eventoAsaas({ status: 'REFUNDED' }), id: 'evt_3' });

      expect(faturas.fatura!.status).toBe(StatusFatura.ESTORNADA);
    });
  });

  describe('correlação', () => {
    it('acha a fatura pela referência externa (o id da nossa fatura)', async () => {
      await service.receber(eventoAsaas());
      expect(eventos.linhas[0].faturaId).toBe('fatura-1');
    });

    it('sem referência, cai para o id da cobrança', async () => {
      await service.receber({
        id: 'evt_1',
        event: 'PAYMENT_RECEIVED',
        payment: { status: 'RECEIVED', chargeId: '5030' },
      });

      expect(faturas.fatura!.status).toBe(StatusFatura.PAGA);
    });

    it('**fatura desconhecida não quebra** — registra e ignora', async () => {
      montar(null);

      const r = await service.receber(eventoAsaas());

      // Pode ser cobrança de outro sistema na mesma company.
      expect(r).toEqual({ aceito: true });
      expect(eventos.linhas[0].status).toBe(StatusWebhookEvento.IGNORADO);
      expect(eventos.linhas[0].detalhe).toMatch(/nenhuma fatura/i);
    });
  });

  describe('status de origem duvidosa', () => {
    it('consulta o gateway quando o status não veio de dentro da cobrança', async () => {
      cobrancas.consultar.mockResolvedValue({ statusGateway: 'RECEIVED' });

      // Envelope achatado da própria Payment API: `status: PROCESSED` é do
      // EVENTO, não do pagamento. Acreditar nele marcaria a fatura errada.
      await service.receber({
        asaasEventId: 'evt_x',
        eventType: 'PAYMENT_RECEIVED',
        status: 'PROCESSED',
        processedResourceId: 5030,
      });

      expect(cobrancas.consultar).toHaveBeenCalledWith('5030');
      expect(faturas.fatura!.status).toBe(StatusFatura.PAGA);
    });

    it('gateway fora não vira baixa errada: ignora e deixa para a conciliação', async () => {
      cobrancas.consultar.mockRejectedValue(new Error('fora do ar'));

      await service.receber({
        asaasEventId: 'evt_x',
        eventType: 'PAYMENT_RECEIVED',
        status: 'PROCESSED',
        processedResourceId: 5030,
      });

      // 'PROCESSED' não está no mapa: guarda o bruto e não mexe no nosso.
      expect(faturas.fatura!.status).toBe(StatusFatura.ABERTA);
      expect(faturas.fatura!.cobrancaStatusGateway).toBe('PROCESSED');
    });
  });

  describe('corpo ilegível', () => {
    it('guarda para investigação e não pede reenvio', async () => {
      const r = await service.receber({ algo: 'que não conhecemos' });

      expect(r.aceito).toBe(false);
      expect(eventos.linhas[0].status).toBe(StatusWebhookEvento.ERRO);
      expect(eventos.linhas[0].payload).toEqual({ algo: 'que não conhecemos' });
    });
  });

  describe('auditoria', () => {
    it('mudança de estado vinda de fora fica no log', async () => {
      await service.receber(eventoAsaas());

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'assinatura.fatura.webhook',
          entityId: 'fatura-1',
          diffJson: expect.objectContaining({ de: 'aberta', para: 'paga' }),
        }),
      );
    });

    it('evento que não muda nada não polui o log', async () => {
      await service.receber(eventoAsaas());
      audit.log.mockClear();

      await service.receber({ ...eventoAsaas({ status: 'PENDING' }), id: 'evt_2' });

      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
