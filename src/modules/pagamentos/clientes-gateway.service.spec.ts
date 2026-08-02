import type { Repository } from 'typeorm';
import { AssinaturaClienteGateway } from '../../database/entities';
import { ClienteParaGateway, ClientesGatewayService } from './clientes-gateway.service';
import { PaymentApiClient, PaymentApiError } from './payment-api.client';

/**
 * O cliente do Chegou virando `customer` no gateway.
 *
 * A regra que este arquivo protege: **falha de sincronização não some**. Ela
 * vira estado na linha do vínculo, que é o que a tela de Pendências lê. Sem
 * isso, um condomínio sem CNPJ simplesmente não seria cobrado, e ninguém
 * saberia até a receita do mês vir menor.
 */

/** Repositório de mentira: guarda as linhas em memória, com o XOR do dono. */
class RepoFake {
  readonly linhas: AssinaturaClienteGateway[] = [];

  async findOne({ where }: { where: Record<string, unknown> }) {
    const tenantId = typeof where.tenantId === 'string' ? where.tenantId : null;
    const admId = typeof where.administradoraId === 'string' ? where.administradoraId : null;
    return (
      this.linhas.find((l) =>
        tenantId ? l.tenantId === tenantId : l.administradoraId === admId,
      ) ?? null
    );
  }

  create(dados: Partial<AssinaturaClienteGateway>) {
    return { id: `linha-${this.linhas.length + 1}`, ...dados } as AssinaturaClienteGateway;
  }

  async save(linha: AssinaturaClienteGateway) {
    if (!this.linhas.includes(linha)) this.linhas.push(linha);
    return linha;
  }
}

const CONDOMINIO: ClienteParaGateway = {
  tipo: 'condominio',
  id: 'tenant-1',
  nome: 'Edifício Solar',
  documento: '11222333000181',
  email: 'contato@solar.com.br',
  telefone: '+5532999998888',
  cidade: 'Juiz de Fora',
  uf: 'MG',
};

const CUSTOMER = {
  id: 42,
  companyId: 7,
  asaasId: 'cus_000123',
  name: 'Edifício Solar',
  document: '11222333000181',
  email: 'contato@solar.com.br',
  phone: '32999998888',
  addressCity: 'Juiz de Fora',
  addressState: 'MG',
  addressPostalCode: null,
};

describe('ClientesGatewayService', () => {
  let repo: RepoFake;
  let api: { configured: boolean; get: jest.Mock; post: jest.Mock; put: jest.Mock };
  let service: ClientesGatewayService;

  beforeEach(() => {
    repo = new RepoFake();
    api = { configured: true, get: jest.fn(), post: jest.fn(), put: jest.fn() };
    service = new ClientesGatewayService(
      repo as unknown as Repository<AssinaturaClienteGateway>,
      api as unknown as PaymentApiClient,
    );
  });

  describe('integração desligada', () => {
    it('não chama nada e não inventa linha de vínculo', async () => {
      api.configured = false;

      const r = await service.sincronizar(CONDOMINIO);

      expect(r).toEqual({ ok: false, customerId: null, motivo: 'desligada' });
      expect(api.post).not.toHaveBeenCalled();
      expect(repo.linhas).toHaveLength(0);
    });
  });

  describe('cadastro incompleto', () => {
    it('sem documento, vira pendência gravada — não exceção', async () => {
      const r = await service.sincronizar({ ...CONDOMINIO, documento: null });

      expect(r.ok).toBe(false);
      expect(r.motivo).toBe('sem_documento');
      expect(api.post).not.toHaveBeenCalled();
      expect(repo.linhas[0].erroUltimaSync).toMatch(/sem CPF\/CNPJ/i);
    });

    it('documento que não passa nos dígitos verificadores nem chega ao gateway', async () => {
      const r = await service.sincronizar({ ...CONDOMINIO, documento: '11111111111' });

      expect(r.motivo).toBe('documento_invalido');
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('criação', () => {
    it('cria o customer e guarda id, asaasId e o documento enviado', async () => {
      api.post.mockResolvedValue(CUSTOMER);

      const r = await service.sincronizar(CONDOMINIO);

      expect(r).toEqual({ ok: true, customerId: '42' });
      const [path, corpo] = api.post.mock.calls[0];
      expect(path).toBe('/customers');
      expect(corpo).toMatchObject({ name: 'Edifício Solar', document: '11222333000181' });

      const linha = repo.linhas[0];
      expect(linha.customerId).toBe('42');
      expect(linha.asaasId).toBe('cus_000123');
      expect(linha.documentoEnviado).toBe('11222333000181');
      expect(linha.erroUltimaSync).toBeNull();
      expect(linha.tenantId).toBe('tenant-1');
      expect(linha.administradoraId).toBeNull();
    });

    it('manda o telefone sem o +55 — o gateway espera DDD sem DDI', async () => {
      api.post.mockResolvedValue(CUSTOMER);

      await service.sincronizar(CONDOMINIO);

      expect(api.post.mock.calls[0][1].phone).toBe('32999998888');
    });

    it('campo vazio fica FORA do corpo, em vez de ir como string vazia', async () => {
      api.post.mockResolvedValue(CUSTOMER);

      await service.sincronizar({ ...CONDOMINIO, email: null, cidade: null });

      const corpo = api.post.mock.calls[0][1];
      expect(corpo).not.toHaveProperty('email');
      expect(corpo).not.toHaveProperty('addressCity');
    });

    it('erro do gateway vira pendência com o motivo, e o vínculo fica sem customer', async () => {
      api.post.mockRejectedValue(new PaymentApiError(500, 'Falha no Asaas'));

      const r = await service.sincronizar(CONDOMINIO);

      expect(r).toMatchObject({ ok: false, motivo: 'erro_sync', detalhe: 'Falha no Asaas' });
      expect(repo.linhas[0].customerId).toBeUndefined();
      expect(repo.linhas[0].erroUltimaSync).toBe('Falha no Asaas');
    });
  });

  describe('documento já cadastrado no gateway (400)', () => {
    it('adota o customer existente em vez de ficar sem cobrança', async () => {
      // Acontece de verdade: retry depois de um timeout que na verdade criou,
      // cliente cadastrado à mão no painel deles, restauração de banco.
      api.post.mockRejectedValue(new PaymentApiError(400, 'Documento já cadastrado'));
      api.get.mockResolvedValue({ content: [CUSTOMER], totalElements: 1, totalPages: 1 });

      const r = await service.sincronizar(CONDOMINIO);

      expect(r).toEqual({ ok: true, customerId: '42' });
      expect(repo.linhas[0].customerId).toBe('42');
    });

    it('só adota com documento EXATAMENTE igual — o search da API é LIKE', async () => {
      api.post.mockRejectedValue(new PaymentApiError(400, 'Documento já cadastrado'));
      // Um parecido, que o LIKE traz junto. Adotar este cobraria o cliente errado.
      api.get.mockResolvedValue({
        content: [{ ...CUSTOMER, id: 99, document: '11222333000199' }],
        totalElements: 1,
        totalPages: 1,
      });

      const r = await service.sincronizar(CONDOMINIO);

      expect(r.ok).toBe(false);
      expect(r.detalhe).toMatch(/já cadastrado/i);
    });

    it('400 que não é documento duplicado continua sendo erro', async () => {
      api.post.mockRejectedValue(new PaymentApiError(400, 'Nome em branco'));
      api.get.mockResolvedValue({ content: [], totalElements: 0, totalPages: 0 });

      const r = await service.sincronizar(CONDOMINIO);

      expect(r).toMatchObject({ ok: false, motivo: 'erro_sync', detalhe: 'Nome em branco' });
    });
  });

  describe('cliente já sincronizado', () => {
    beforeEach(async () => {
      api.post.mockResolvedValue(CUSTOMER);
      await service.sincronizar(CONDOMINIO);
      api.post.mockClear();
    });

    it('atualiza o cadastro em vez de criar outro customer', async () => {
      api.put.mockResolvedValue({ ...CUSTOMER, name: 'Edifício Solar II' });

      const r = await service.sincronizar({ ...CONDOMINIO, nome: 'Edifício Solar II' });

      expect(api.post).not.toHaveBeenCalled();
      expect(api.put).toHaveBeenCalledWith('/customers/42', expect.objectContaining({
        name: 'Edifício Solar II',
      }));
      expect(r).toEqual({ ok: true, customerId: '42' });
      expect(repo.linhas).toHaveLength(1);
    });

    it('a atualização NÃO manda documento — a API não altera esse campo', async () => {
      api.put.mockResolvedValue(CUSTOMER);

      await service.sincronizar(CONDOMINIO);

      expect(api.put.mock.calls[0][1]).not.toHaveProperty('document');
    });
  });

  describe('administradora', () => {
    it('grava o vínculo do lado da administradora, com tenant nulo', async () => {
      api.post.mockResolvedValue({ ...CUSTOMER, id: 77 });

      await service.sincronizar({
        tipo: 'administradora',
        id: 'adm-1',
        nome: 'Central Administradora',
        documento: '11444777000161',
      });

      expect(repo.linhas[0].administradoraId).toBe('adm-1');
      expect(repo.linhas[0].tenantId).toBeNull();
      expect(repo.linhas[0].customerId).toBe('77');
    });
  });
});
