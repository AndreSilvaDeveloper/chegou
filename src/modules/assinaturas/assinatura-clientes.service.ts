import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Administradora, AssinaturaClienteGateway, Tenant } from '../../database/entities';
import { documentoValido } from '../../common/documento';
import {
  ClienteParaGateway,
  ClientesGatewayService,
  MotivoPendencia,
  ResultadoSincronizacao,
} from '../pagamentos/clientes-gateway.service';

/** O tipo do cliente na URL — os dois ids são UUID, então o tipo desambigua. */
export type TipoCliente = 'condominio' | 'administradora';

/** Um cliente que hoje **não** poderia ser cobrado, e por quê. */
export interface PendenciaCliente {
  tipo: TipoCliente;
  id: string;
  nome: string;
  motivo: MotivoPendencia | 'nunca_sincronizado';
  detalhe: string;
  documento: string | null;
  sincronizadoEm: string | null;
}

export interface PainelPendencias {
  /** `false` quando não há gateway configurado — a tela diz isso em vez de listar tudo como erro. */
  integracaoLigada: boolean;
  resumo: { clientes: number; sincronizados: number; pendentes: number };
  pendencias: PendenciaCliente[];
}

/**
 * Os clientes da assinatura no gateway de pagamento.
 *
 * A divisão com o módulo Pagamentos: **lá se sabe falar com a API, aqui se sabe
 * quem é o cliente**. Quem paga o Chegou é o condomínio direto ou a
 * administradora — condomínio de carteira nunca vira cliente do gateway, porque
 * ele não é cobrado (a regra de ouro do módulo).
 */
@Injectable()
export class AssinaturaClientesService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Administradora) private readonly administradoraRepo: Repository<Administradora>,
    @InjectRepository(AssinaturaClienteGateway)
    private readonly vinculoRepo: Repository<AssinaturaClienteGateway>,
    private readonly gateway: ClientesGatewayService,
  ) {}

  /**
   * Manda um cliente para o gateway (cria ou atualiza o `customer`).
   *
   * O condomínio de carteira é recusado aqui, e não lá dentro: o gateway
   * aceitaria de bom grado criar um customer para ele, e o resultado seria um
   * cliente que existe no Asaas e nunca recebe cobrança — o tipo de sujeira que
   * só aparece meses depois, na conciliação.
   */
  async sincronizar(tipo: TipoCliente, id: string): Promise<ResultadoSincronizacao> {
    const cliente = await this.descritor(tipo, id);
    return this.gateway.sincronizar(cliente);
  }

  /**
   * O vínculo com o gateway, se existir.
   *
   * É por aqui que a emissão descobre o `customerId` — e é o que faz uma fatura
   * de cliente não sincronizado virar erro com motivo em vez de um 404 cru
   * vindo do gateway.
   */
  vinculoDe(tipo: TipoCliente, id: string): Promise<AssinaturaClienteGateway | null> {
    return this.vinculoRepo.findOne({
      where: tipo === 'condominio' ? { tenantId: id } : { administradoraId: id },
    });
  }

  /** O cliente do jeito que o gateway precisa, montado do nosso cadastro. */
  async descritor(tipo: TipoCliente, id: string): Promise<ClienteParaGateway> {
    if (tipo === 'condominio') {
      const tenant = await this.tenantRepo.findOne({ where: { id } });
      if (!tenant) throw new NotFoundException('Condomínio não encontrado');
      if (tenant.administradoraId) {
        throw new NotFoundException(
          'Condomínio de carteira não é cliente do gateway: quem paga por ele é a administradora',
        );
      }
      return {
        tipo,
        id: tenant.id,
        nome: tenant.nome,
        documento: tenant.documento,
        email: tenant.emailContato,
        telefone: tenant.telefoneContato,
        endereco: tenant.endereco,
        numero: tenant.numero,
        bairro: tenant.bairro,
        cidade: tenant.cidade,
        uf: tenant.estado,
        cep: tenant.cep,
      };
    }

    const adm = await this.administradoraRepo.findOne({ where: { id } });
    if (!adm) throw new NotFoundException('Administradora não encontrada');
    return {
      tipo,
      id: adm.id,
      nome: adm.nome,
      documento: adm.documento,
      email: adm.emailContato,
      telefone: adm.telefoneContato,
    };
  }

  /**
   * Quem hoje não tem cobrança possível.
   *
   * O conjunto de clientes é o **mesmo** de `listarPrevias()`: condomínio ativo
   * e direto, mais administradora ativa. Se um dia essa seleção mudar num lugar
   * e não no outro, aparece cliente faturado que nunca foi sincronizado — por
   * isso a regra está escrita igual nos dois, e a doc do módulo aponta as duas.
   *
   * Note que a checagem é de **cadastro**, sem chamada ao gateway: a tela abre
   * rápido e continua abrindo com a API fora do ar. O que depende de rede é o
   * botão de sincronizar.
   */
  async pendencias(): Promise<PainelPendencias> {
    const [condominios, administradoras] = await Promise.all([
      this.tenantRepo.find({
        where: { ativo: true, administradoraId: IsNull() },
        order: { nome: 'ASC' },
      }),
      this.administradoraRepo.find({ where: { ativo: true }, order: { nome: 'ASC' } }),
    ]);

    const vinculos = await this.vinculosDe(
      condominios.map((c) => c.id),
      administradoras.map((a) => a.id),
    );

    const pendencias: PendenciaCliente[] = [];
    let sincronizados = 0;

    const avaliar = (tipo: TipoCliente, id: string, nome: string, documento: string | null) => {
      const vinculo = vinculos.get(`${tipo}:${id}`) ?? null;
      const pendencia = this.avaliarCliente(tipo, id, nome, documento, vinculo);
      if (pendencia) pendencias.push(pendencia);
      else sincronizados += 1;
    };

    for (const c of condominios) avaliar('condominio', c.id, c.nome, c.documento);
    for (const a of administradoras) avaliar('administradora', a.id, a.nome, a.documento);

    return {
      integracaoLigada: this.gateway.ligado,
      resumo: {
        clientes: condominios.length + administradoras.length,
        sincronizados,
        pendentes: pendencias.length,
      },
      pendencias,
    };
  }

  /**
   * O estado de um cliente, em ordem de gravidade.
   *
   * A ordem importa: quem não tem documento não adianta reportar como "erro de
   * sincronização", porque o conserto é no cadastro, não no botão de tentar de
   * novo. É essa distinção que faz a tela dizer o que fazer em vez de só dizer
   * que algo falhou.
   */
  private avaliarCliente(
    tipo: TipoCliente,
    id: string,
    nome: string,
    documento: string | null,
    vinculo: AssinaturaClienteGateway | null,
  ): PendenciaCliente | null {
    const base = {
      tipo,
      id,
      nome,
      documento,
      sincronizadoEm: vinculo?.sincronizadoEm?.toISOString() ?? null,
    };

    if (!documento) {
      return {
        ...base,
        motivo: 'sem_documento',
        detalhe: 'Sem CPF/CNPJ no cadastro — o gateway exige documento para criar o cliente',
      };
    }
    if (!documentoValido(documento)) {
      return {
        ...base,
        motivo: 'documento_invalido',
        detalhe: 'O CPF/CNPJ cadastrado não passa na conta dos dígitos verificadores',
      };
    }
    if (!vinculo?.customerId) {
      return {
        ...base,
        motivo: vinculo?.erroUltimaSync ? 'erro_sync' : 'nunca_sincronizado',
        detalhe: vinculo?.erroUltimaSync ?? 'Ainda não foi enviado ao gateway de pagamento',
      };
    }
    // Documento trocado depois de sincronizado: o gateway **não** atualiza
    // documento, então o customer lá continua com o antigo e a cobrança sairia
    // no nome errado. Só um customer novo resolve — por isso é pendência, e não
    // algo que o botão de sincronizar conserta sozinho.
    if (vinculo.documentoEnviado && vinculo.documentoEnviado !== documento) {
      return {
        ...base,
        motivo: 'erro_sync',
        detalhe: `O gateway está com o documento ${vinculo.documentoEnviado}, e o cadastro mudou para ${documento}. Documento não se altera no gateway: é preciso criar um cliente novo lá.`,
      };
    }
    return null;
  }

  /** Vínculos dos dois tipos numa consulta por tipo, indexados para o laço. */
  private async vinculosDe(
    tenantIds: string[],
    administradoraIds: string[],
  ): Promise<Map<string, AssinaturaClienteGateway>> {
    const busca: Promise<AssinaturaClienteGateway[]>[] = [];
    if (tenantIds.length) busca.push(this.vinculoRepo.find({ where: { tenantId: In(tenantIds) } }));
    if (administradoraIds.length) {
      busca.push(this.vinculoRepo.find({ where: { administradoraId: In(administradoraIds) } }));
    }

    const mapa = new Map<string, AssinaturaClienteGateway>();
    for (const lote of await Promise.all(busca)) {
      for (const v of lote) {
        const chave = v.tenantId ? `condominio:${v.tenantId}` : `administradora:${v.administradoraId}`;
        mapa.set(chave, v);
      }
    }
    return mapa;
  }
}
