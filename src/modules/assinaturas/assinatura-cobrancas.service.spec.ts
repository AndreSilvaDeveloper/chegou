import type { Repository } from 'typeorm';
import { AssinaturaFatura } from '../../database/entities';
import {
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';
import { CobrancasService } from '../pagamentos/cobrancas.service';
import { PaymentApiError } from '../pagamentos/payment-api.client';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import { AcessoService } from '../pagamentos/acesso.service';
import { AssinaturaClientesService } from './assinatura-clientes.service';
import { CupomFaturaService } from './cupom-fatura.service';

/**
 * A fatura virando cobrança.
 *
 * O teste que justifica o arquivo é **a mesma `Idempotency-Key` no retry**: é
 * ele que impede cobrar o cliente duas vezes quando o primeiro POST deu
 * timeout. O resto guarda as fronteiras em volta dele.
 */

/** Repositório de mentira com uma fatura só, mas com `update` de verdade. */
class RepoFake {
  constructor(public fatura: AssinaturaFatura) {}

  async findOne({ where }: { where: { id: string } }) {
    return where.id === this.fatura.id ? this.fatura : null;
  }

  async update(id: string, campos: Partial<AssinaturaFatura>) {
    if (id === this.fatura.id) Object.assign(this.fatura, campos);
    return { affected: 1 };
  }
}

const fatura = (over: Partial<AssinaturaFatura> = {}): AssinaturaFatura =>
  ({
    id: 'fatura-1',
    tenantId: 'tenant-1',
    administradoraId: null,
    competencia: '2026-04-01',
    valor: 418.8,
    vencimento: '2026-05-10',
    status: StatusFatura.ABERTA,
    cobrancaStatus: StatusCobranca.PENDENTE,
    cobrancaId: null,
    cobrancaIdempotencyKey: null,
    invoiceUrl: null,
    cobrancaDessincronizada: false,
    ...over,
  }) as AssinaturaFatura;

const EMITIDA = {
  cobrancaId: '5030',
  asaasId: 'pay_1',
  invoiceUrl: 'https://asaas.com/i/5030',
  statusGateway: 'PENDING' as const,
  valor: 418.8,
};

describe('AssinaturaCobrancasService', () => {
  let repo: RepoFake;
  let cobrancas: {
    ligado: boolean;
    emitir: jest.Mock;
    cancelar: jest.Mock;
    consultarPorReferencia: jest.Mock;
    receberEmDinheiro: jest.Mock;
  };
  let clientes: { vinculoDe: jest.Mock };
  let acesso: { ativo: boolean; esquecer: jest.Mock };
  let cupom: { resolver: jest.Mock };
  let auditoria: { log: jest.Mock };
  let service: AssinaturaCobrancasService;

  const montar = (f: AssinaturaFatura) => {
    repo = new RepoFake(f);
    service = new AssinaturaCobrancasService(
      repo as unknown as Repository<AssinaturaFatura>,
      cobrancas as unknown as CobrancasService,
      clientes as unknown as AssinaturaClientesService,
      acesso as unknown as AcessoService,
      cupom as unknown as CupomFaturaService,
      auditoria as never,
    );
  };

  beforeEach(() => {
    cobrancas = {
      ligado: true,
      emitir: jest.fn().mockResolvedValue(EMITIDA),
      cancelar: jest.fn().mockResolvedValue(undefined),
      consultarPorReferencia: jest.fn().mockResolvedValue(null),
      receberEmDinheiro: jest.fn().mockResolvedValue(undefined),
    };
    clientes = { vinculoDe: jest.fn().mockResolvedValue({ customerId: '42' }) };
    acesso = { ativo: false, esquecer: jest.fn().mockResolvedValue(undefined) };
    cupom = { resolver: jest.fn().mockResolvedValue(null) };
    auditoria = { log: jest.fn().mockResolvedValue(undefined) };
    montar(fatura());
  });

  describe('idempotência — o que impede cobrar duas vezes', () => {
    it('grava a chave ANTES de chamar o gateway', async () => {
      let chaveNoBancoQuandoChamou: string | null = null;
      cobrancas.emitir.mockImplementation(async () => {
        // Se a chave só fosse gravada depois, um crash aqui a perderia — e o
        // retry geraria outra, criando uma segunda cobrança.
        chaveNoBancoQuandoChamou = repo.fatura.cobrancaIdempotencyKey;
        return EMITIDA;
      });

      await service.emitir('fatura-1');

      expect(chaveNoBancoQuandoChamou).toBeTruthy();
      expect(chaveNoBancoQuandoChamou).toBe(cobrancas.emitir.mock.calls[0][0].idempotencyKey);
    });

    it('**o retry usa a MESMA chave** — é o teste que impede cobrança dupla', async () => {
      cobrancas.emitir.mockRejectedValueOnce(new PaymentApiError(0, 'timeout'));
      await service.emitir('fatura-1');
      const primeira = cobrancas.emitir.mock.calls[0][0].idempotencyKey;

      // Segunda tentativa, depois do timeout: não sabemos se a primeira criou.
      cobrancas.emitir.mockResolvedValueOnce(EMITIDA);
      await service.emitir('fatura-1');
      const segunda = cobrancas.emitir.mock.calls[1][0].idempotencyKey;

      expect(segunda).toBe(primeira);
    });

    it('fatura já emitida não chama o gateway de novo', async () => {
      montar(
        fatura({
          cobrancaStatus: StatusCobranca.EMITIDA,
          cobrancaId: '5030',
          invoiceUrl: 'https://asaas.com/i/5030',
        }),
      );

      const r = await service.emitir('fatura-1');

      expect(cobrancas.emitir).not.toHaveBeenCalled();
      expect(r).toMatchObject({ ok: true, cobrancaId: '5030' });
    });
  });

  describe('emissão', () => {
    it('grava id, link e status do gateway', async () => {
      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(true);
      expect(repo.fatura.cobrancaId).toBe('5030');
      expect(repo.fatura.invoiceUrl).toBe('https://asaas.com/i/5030');
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.EMITIDA);
      expect(repo.fatura.cobrancaStatusGateway).toBe('PENDING');
      expect(repo.fatura.cobrancaErro).toBeNull();
    });

    it('manda o id da fatura como referência externa', async () => {
      await service.emitir('fatura-1');

      // É a correlação que sobrevive a tudo: perdido o cobranca_id, o webhook
      // ainda diz de qual fatura ele fala.
      expect(cobrancas.emitir.mock.calls[0][0].referenciaExterna).toBe('fatura-1');
    });

    it('cliente sem customer no gateway vira erro com o que fazer', async () => {
      clientes.vinculoDe.mockResolvedValue(null);

      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(false);
      expect(r.detalhe).toMatch(/Sincronize-o na aba Pendências/i);
      expect(cobrancas.emitir).not.toHaveBeenCalled();
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.ERRO);
    });

    it('falha do gateway vira estado na fatura, com o motivo', async () => {
      cobrancas.emitir.mockRejectedValue(new PaymentApiError(502, 'Asaas indisponível'));

      const r = await service.emitir('fatura-1');

      expect(r).toMatchObject({ ok: false, detalhe: 'Asaas indisponível' });
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.ERRO);
      expect(repo.fatura.cobrancaErro).toBe('Asaas indisponível');
    });

    it('gateway desligado marca a fatura como desligada, sem erro', async () => {
      cobrancas.ligado = false;

      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(false);
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.DESLIGADA);
      // Não é falha: é ambiente sem gateway. Marcar como erro encheria a tela
      // de pendências em todo ambiente de desenvolvimento.
      expect(repo.fatura.cobrancaErro).toBeUndefined();
    });
  });

  describe('o que não vira cobrança', () => {
    it.each([
      [StatusFatura.PAGA, /já está paga/i],
      [StatusFatura.CANCELADA, /cancelada não gera cobrança/i],
    ])('fatura %s não é emitida', async (status, esperado) => {
      montar(fatura({ status }));

      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(false);
      expect(r.detalhe).toMatch(esperado);
      expect(cobrancas.emitir).not.toHaveBeenCalled();
    });

    it('valor zero não vira cobrança — o gateway não emite R$ 0,00', async () => {
      montar(fatura({ valor: 0 }));

      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(false);
      expect(cobrancas.emitir).not.toHaveBeenCalled();
    });
  });

  describe('baixa manual espelhada', () => {
    it('avisa o gateway e limpa a marca de dessincronizada', async () => {
      montar(fatura({ cobrancaId: '5030', cobrancaStatus: StatusCobranca.EMITIDA }));

      await service.espelharBaixa(repo.fatura);

      expect(cobrancas.receberEmDinheiro).toHaveBeenCalledWith('5030', 'baixa-fatura-1');
      expect(repo.fatura.cobrancaDessincronizada).toBe(false);
    });

    it('**gateway fora NÃO derruba a baixa** — marca dessincronizada e segue', async () => {
      montar(fatura({ cobrancaId: '5030', cobrancaStatus: StatusCobranca.EMITIDA }));
      cobrancas.receberEmDinheiro.mockRejectedValue(new PaymentApiError(0, 'fora do ar'));

      // Dinheiro que entrou não pode ficar refém de API fora do ar: este método
      // engole o erro de propósito, e a conciliação resolve depois.
      await expect(service.espelharBaixa(repo.fatura)).resolves.toBeUndefined();
      expect(repo.fatura.cobrancaDessincronizada).toBe(true);
    });

    it('sem cobrança emitida não há o que espelhar', async () => {
      await service.espelharBaixa(repo.fatura);
      expect(cobrancas.receberEmDinheiro).not.toHaveBeenCalled();
    });
  });

  describe('cancelamento', () => {
    it('cancela no gateway e marca a cobrança como cancelada', async () => {
      montar(fatura({ cobrancaId: '5030', cobrancaStatus: StatusCobranca.EMITIDA }));

      await service.cancelarCobranca(repo.fatura);

      expect(cobrancas.cancelar).toHaveBeenCalledWith('5030');
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.CANCELADA);
    });

    it('**falha ao cancelar PROPAGA** — o contrário da baixa', async () => {
      montar(fatura({ cobrancaId: '5030', cobrancaStatus: StatusCobranca.EMITIDA }));
      cobrancas.cancelar.mockRejectedValue(new PaymentApiError(502, 'fora do ar'));

      // Cancelar só do nosso lado deixaria uma cobrança viva que o cliente pode
      // pagar por engano — então o cancelamento local não pode acontecer.
      await expect(service.cancelarCobranca(repo.fatura)).rejects.toThrow(/fora do ar/i);
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.EMITIDA);
    });
  });

  describe('cupom', () => {
    const COM_CUPOM = {
      codigo: 'DESC20',
      desconto: 83.76,
      valorSemCupom: 418.8,
      valorLiquido: 335.04,
    };

    it('**manda o valor SEM o cupom + o código** — nunca o valor já descontado', async () => {
      cupom.resolver.mockResolvedValue(COM_CUPOM);
      cobrancas.emitir.mockResolvedValue({ ...EMITIDA, valor: 335.04 });

      await service.emitir('fatura-1');

      // Mandar 335,04 *e* o código aplicaria o desconto duas vezes: o gateway
      // tiraria outros 20% e cobraria 268,03. É o bug de dinheiro mais fácil de
      // escrever nesta integração.
      const pedido = cobrancas.emitir.mock.calls[0][0];
      expect(pedido.valor).toBe(418.8);
      expect(pedido.cupomCodigo).toBe('DESC20');
    });

    it('a fatura passa a dizer o valor COM o cupom', async () => {
      cupom.resolver.mockResolvedValue(COM_CUPOM);
      cobrancas.emitir.mockResolvedValue({ ...EMITIDA, valor: 335.04 });

      await service.emitir('fatura-1');

      expect(repo.fatura.valor).toBe(335.04);
      expect(repo.fatura.cupomCodigo).toBe('DESC20');
      expect(repo.fatura.cupomDesconto).toBe(83.76);
    });

    it('**valor divergente NÃO emite** — cancela a cobrança e vira pendência', async () => {
      cupom.resolver.mockResolvedValue(COM_CUPOM);
      // O gateway descontou diferente do que o validate prometeu.
      cobrancas.emitir.mockResolvedValue({ ...EMITIDA, valor: 300 });
      cobrancas.consultarPorReferencia.mockResolvedValue({ cobrancaId: '5030' });

      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(false);
      expect(repo.fatura.cobrancaStatus).toBe(StatusCobranca.ERRO);
      expect(repo.fatura.cobrancaId).toBeNull();
      // A cobrança existe do outro lado com um valor que não combinamos, e um
      // link que o cliente pode abrir. Cancelar é o que impede o pagamento
      // errado.
      expect(cobrancas.cancelar).toHaveBeenCalledWith('5030');
    });

    it('**cupom expirado entre validar e cobrar (422) recalcula sem ele e emite**', async () => {
      cupom.resolver.mockResolvedValue(COM_CUPOM);
      cobrancas.emitir
        .mockRejectedValueOnce(new PaymentApiError(422, 'Cupom inválido'))
        .mockResolvedValueOnce(EMITIDA);
      // Na segunda passada não há mais cupom a aplicar.
      cupom.resolver.mockResolvedValueOnce(COM_CUPOM).mockResolvedValue(null);

      const r = await service.emitir('fatura-1');

      expect(r.ok).toBe(true);
      expect(repo.fatura.cupomCodigo).toBeNull();
      expect(repo.fatura.valor).toBe(418.8);
      expect(auditoria.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'assinatura.cupom.recusado_na_emissao' }),
      );
    });

    it('a reemissão sem cupom usa chave NOVA', async () => {
      cupom.resolver.mockResolvedValue(COM_CUPOM);
      cobrancas.emitir
        .mockRejectedValueOnce(new PaymentApiError(422, 'Cupom inválido'))
        .mockResolvedValueOnce(EMITIDA);
      cupom.resolver.mockResolvedValueOnce(COM_CUPOM).mockResolvedValue(null);

      await service.emitir('fatura-1');

      // A chave anterior está associada, do lado deles, à tentativa que levava o
      // cupom — reusá-la devolveria aquela mesma tentativa recusada.
      const primeira = cobrancas.emitir.mock.calls[0][0].idempotencyKey;
      const segunda = cobrancas.emitir.mock.calls[1][0].idempotencyKey;
      expect(segunda).not.toBe(primeira);
    });

    it('**cupom que zera a fatura NÃO vira cobrança** — ela nasce paga', async () => {
      cupom.resolver.mockResolvedValue({ ...COM_CUPOM, desconto: 418.8, valorLiquido: 0 });

      const r = await service.emitir('fatura-1');

      // O gateway não emite R$ 0,00. A fatura nasce paga com o motivo, e o
      // histórico mostra o mês coberto em vez de um buraco.
      expect(cobrancas.emitir).not.toHaveBeenCalled();
      expect(r.ok).toBe(true);
      expect(repo.fatura.valor).toBe(0);
      expect(repo.fatura.status).toBe(StatusFatura.PAGA);
    });

    it('sem cupom, o valor da cobrança é o da fatura e não vai código', async () => {
      await service.emitir('fatura-1');

      const pedido = cobrancas.emitir.mock.calls[0][0];
      expect(pedido.valor).toBe(418.8);
      expect(pedido.cupomCodigo).toBeUndefined();
    });
  });
});
