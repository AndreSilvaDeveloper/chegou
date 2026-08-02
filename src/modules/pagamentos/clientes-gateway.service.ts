import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AssinaturaClienteGateway } from '../../database/entities';
import { documentoValido } from '../../common/documento';
import { PaymentApiClient, PaymentApiError } from './payment-api.client';
import type {
  CreateCustomerRequest,
  CustomerResponse,
  Page,
  UpdateCustomerRequest,
} from './payment-api.types';

/**
 * Quem paga, do jeito que o gateway precisa saber.
 *
 * Montado pelo módulo Assinaturas, que é quem sabe se o sacado é o condomínio
 * ou a administradora. Aqui só se traduz isso para `customer`.
 */
export interface ClienteParaGateway {
  tipo: 'condominio' | 'administradora';
  id: string;
  nome: string;
  documento: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/** Por que um cliente não tem cobrança possível hoje. */
export type MotivoPendencia = 'sem_documento' | 'documento_invalido' | 'erro_sync' | 'desligada';

export interface ResultadoSincronizacao {
  ok: boolean;
  customerId: string | null;
  motivo?: MotivoPendencia;
  detalhe?: string;
}

/**
 * O cliente do Chegou virando `customer` na Payment API.
 *
 * A fronteira deste módulo: **ele fala com o gateway e não conhece regra de
 * assinatura**. Não sabe o que é faixa, fatura ou carteira — recebe um
 * `ClienteParaGateway` pronto e devolve o vínculo.
 *
 * A disciplina que vale aqui inteira: **falha de sincronização não é exceção
 * que sobe, é estado que se grava**. A linha do vínculo guarda o motivo, a tela
 * de Pendências mostra, e o superadmin resolve. Erro que só existe no log é
 * erro que ninguém vê — e este aqui custa a cobrança de um cliente no mês.
 */
@Injectable()
export class ClientesGatewayService {
  private readonly logger = new Logger(ClientesGatewayService.name);

  constructor(
    @InjectRepository(AssinaturaClienteGateway)
    private readonly repo: Repository<AssinaturaClienteGateway>,
    private readonly api: PaymentApiClient,
  ) {}

  /** A integração está ligada? Vazio em env = tudo desligado, sem erro. */
  get ligado(): boolean {
    return this.api.configured;
  }

  /** O vínculo de um cliente, se já existir. */
  buscarVinculo(cliente: Pick<ClienteParaGateway, 'tipo' | 'id'>): Promise<AssinaturaClienteGateway | null> {
    return this.repo.findOne({ where: this.chaveDoDono(cliente) });
  }

  /**
   * Garante o `customer` do cliente no gateway e devolve o vínculo.
   *
   * Idempotente: com vínculo já feito, atualiza o cadastro (nome, e-mail,
   * telefone, endereço) em vez de criar outro. Documento **não** é atualizado —
   * a API não aceita, e é por isso que guardamos qual foi enviado.
   */
  async sincronizar(cliente: ClienteParaGateway): Promise<ResultadoSincronizacao> {
    if (!this.ligado) {
      return { ok: false, customerId: null, motivo: 'desligada' };
    }

    const documento = (cliente.documento ?? '').trim();
    if (!documento) {
      await this.registrarFalha(cliente, 'Cliente sem CPF/CNPJ cadastrado');
      return {
        ok: false,
        customerId: null,
        motivo: 'sem_documento',
        detalhe: 'Cadastre o CPF ou CNPJ do cliente para que ele possa ser cobrado',
      };
    }

    // Conferir aqui, e não só no DTO: o documento pode ter entrado antes da
    // validação existir, ou por script. O gateway responderia 400 e o motivo
    // ficaria genérico — este já diz onde consertar.
    if (!documentoValido(documento)) {
      await this.registrarFalha(cliente, `Documento inválido: ${documento}`);
      return {
        ok: false,
        customerId: null,
        motivo: 'documento_invalido',
        detalhe: 'O CPF/CNPJ cadastrado não passa na conta dos dígitos verificadores',
      };
    }

    const vinculo = await this.buscarVinculo(cliente);

    try {
      const customer = vinculo?.customerId
        ? await this.atualizarCustomer(vinculo.customerId, cliente)
        : await this.criarOuAdotarCustomer(cliente, documento);

      await this.registrarSucesso(cliente, customer, documento);
      return { ok: true, customerId: String(customer.id) };
    } catch (err) {
      const detalhe = err instanceof PaymentApiError ? err.message : (err as Error).message;
      await this.registrarFalha(cliente, detalhe);
      this.logger.error(`Sincronização de ${cliente.tipo} ${cliente.id} falhou: ${detalhe}`);
      return { ok: false, customerId: null, motivo: 'erro_sync', detalhe };
    }
  }

  /**
   * Cria o customer — e, se o documento já existir lá, **adota** o que existe.
   *
   * O 400 de documento duplicado acontece de verdade em três situações: retry
   * depois de um timeout que na verdade criou, cliente cadastrado à mão no
   * painel do gateway, e restauração de banco. Em todas elas o customer certo já
   * está lá, e criar outro é impossível (o documento é único entre os ativos da
   * company). Adotar é a única saída que não exige alguém abrir os dois sistemas
   * lado a lado.
   *
   * Adotar é seguro porque documento igual **é** a mesma pessoa jurídica. O que
   * protege contra adotar o customer de outro cliente nosso é o índice único de
   * `customer_id`: se ele já estiver vinculado, a gravação falha e vira
   * pendência — que é o desfecho certo, porque dois clientes nossos com o mesmo
   * documento é erro de cadastro, não de integração.
   */
  private async criarOuAdotarCustomer(
    cliente: ClienteParaGateway,
    documento: string,
  ): Promise<CustomerResponse> {
    const corpo: CreateCustomerRequest = {
      name: cliente.nome,
      document: documento,
      ...this.camposDeContato(cliente),
    };

    try {
      return await this.api.post<CustomerResponse>('/customers', corpo);
    } catch (err) {
      if (!(err instanceof PaymentApiError) || err.status !== 400) throw err;

      const existente = await this.procurarPorDocumento(documento);
      if (!existente) throw err;

      this.logger.warn(
        `Documento ${documento} já existia na Payment API; adotando customer ${existente.id}`,
      );
      return existente;
    }
  }

  /**
   * Procura um customer pelo documento exato.
   *
   * O `search` da API é LIKE em nome, documento e e-mail — então ele traz
   * parecidos. A conferência do documento exato é nossa: adotar por semelhança
   * é como se cobra o cliente errado.
   */
  private async procurarPorDocumento(documento: string): Promise<CustomerResponse | null> {
    try {
      const pagina = await this.api.get<Page<CustomerResponse>>(
        `/customers?search=${encodeURIComponent(documento)}&size=20`,
      );
      return pagina.content?.find((c) => c.document === documento) ?? null;
    } catch (err) {
      this.logger.warn(`Busca por documento ${documento} falhou: ${(err as Error).message}`);
      return null;
    }
  }

  private atualizarCustomer(customerId: string, cliente: ClienteParaGateway): Promise<CustomerResponse> {
    const corpo: UpdateCustomerRequest = {
      name: cliente.nome,
      ...this.camposDeContato(cliente),
    };
    return this.api.put<CustomerResponse>(`/customers/${customerId}`, corpo);
  }

  /**
   * Contato e endereço, só o que existe.
   *
   * Campo vazio fica **fora do corpo** em vez de ir como string vazia: no
   * `PUT` parcial, string vazia apagaria o que estivesse lá — e o e-mail do
   * gateway é por onde o cliente recebe o link de pagamento.
   */
  private camposDeContato(cliente: ClienteParaGateway): Partial<CreateCustomerRequest> {
    const campos: Partial<CreateCustomerRequest> = {};
    if (cliente.email) campos.email = cliente.email;
    // O telefone sai daqui em E.164 (`+5532...`); o gateway espera com DDD e
    // sem DDI. Mandar o `+55` faria o Asaas recusar ou guardar torto.
    if (cliente.telefone) campos.phone = cliente.telefone.replace(/^\+55/, '').replace(/\D/g, '');
    if (cliente.endereco) campos.addressStreet = cliente.endereco;
    if (cliente.cidade) campos.addressCity = cliente.cidade;
    if (cliente.uf) campos.addressState = cliente.uf;
    if (cliente.cep) campos.addressPostalCode = cliente.cep;
    return campos;
  }

  // ------------------------------------------------------------------ estado

  private chaveDoDono(cliente: Pick<ClienteParaGateway, 'tipo' | 'id'>) {
    return cliente.tipo === 'condominio'
      ? { tenantId: cliente.id, administradoraId: IsNull() }
      : { administradoraId: cliente.id, tenantId: IsNull() };
  }

  /** Cria a linha do vínculo se ela ainda não existir. */
  private async garantirLinha(cliente: ClienteParaGateway): Promise<AssinaturaClienteGateway> {
    const existente = await this.buscarVinculo(cliente);
    if (existente) return existente;

    return this.repo.save(
      this.repo.create({
        tenantId: cliente.tipo === 'condominio' ? cliente.id : null,
        administradoraId: cliente.tipo === 'administradora' ? cliente.id : null,
      }),
    );
  }

  private async registrarSucesso(
    cliente: ClienteParaGateway,
    customer: CustomerResponse,
    documento: string,
  ): Promise<void> {
    const linha = await this.garantirLinha(cliente);
    linha.customerId = String(customer.id);
    linha.asaasId = customer.asaasId ?? null;
    linha.documentoEnviado = documento;
    linha.sincronizadoEm = new Date();
    linha.erroUltimaSync = null;
    await this.repo.save(linha);
  }

  private async registrarFalha(cliente: ClienteParaGateway, motivo: string): Promise<void> {
    const linha = await this.garantirLinha(cliente);
    linha.erroUltimaSync = motivo.slice(0, 500);
    await this.repo.save(linha);
  }
}
