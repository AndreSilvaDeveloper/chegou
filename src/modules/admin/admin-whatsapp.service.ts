import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacao, Tenant } from '../../database/entities';
import { StatusNotificacao, TipoNotificacao } from '../../database/entities/notificacao.entity';
import {
  DEFAULT_TEMPLATE_ENCOMENDA,
  DEFAULT_TEMPLATE_RETIRADA,
  TemplateVariavel,
  VARIAVEIS_ENCOMENDA,
  VARIAVEIS_RETIRADA,
} from '../notificacoes/message-template';
import { DEFAULT_TENANT_CONFIG } from './dto/config-tenant.dto';
import { AtualizarWhatsappConfigDto } from './dto/atualizar-whatsapp-config.dto';

export interface WhatsappCondominioResumo {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  provisionado: boolean;
  status: string | null;
  conectado: boolean;
  numero: string | null;
  disparosEncomenda: number;
  disparosAviso: number;
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  templateEncomenda: string;
  templateRetirada: string;
}

function mergedConfig(tenant: Tenant) {
  return { ...DEFAULT_TENANT_CONFIG, ...(tenant.configJson ?? {}) } as typeof DEFAULT_TENANT_CONFIG;
}

@Injectable()
export class AdminWhatsappService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Notificacao) private readonly notificacaoRepo: Repository<Notificacao>,
  ) {}

  private async contadores(): Promise<Map<string, { encomenda: number; aviso: number }>> {
    const rows = await this.notificacaoRepo
      .createQueryBuilder('n')
      .select('n.tenant_id', 'tenantId')
      .addSelect('n.tipo', 'tipo')
      .addSelect('COUNT(*)::int', 'count')
      .where('n.status = :enviada', { enviada: StatusNotificacao.ENVIADA })
      .groupBy('n.tenant_id')
      .addGroupBy('n.tipo')
      .getRawMany<{ tenantId: string; tipo: string; count: number }>();

    const map = new Map<string, { encomenda: number; aviso: number }>();
    for (const r of rows) {
      const entry = map.get(r.tenantId) ?? { encomenda: 0, aviso: 0 };
      if (r.tipo === TipoNotificacao.ENCOMENDA) entry.encomenda += r.count;
      else if (r.tipo === TipoNotificacao.AVISO) entry.aviso += r.count;
      map.set(r.tenantId, entry);
    }
    return map;
  }

  async listar(): Promise<{
    variaveis: TemplateVariavel[];
    templatePadrao: string;
    variaveisRetirada: TemplateVariavel[];
    templatePadraoRetirada: string;
    condominios: WhatsappCondominioResumo[];
  }> {
    const [tenants, counts] = await Promise.all([
      this.tenantRepo.find({ order: { nome: 'ASC' } }),
      this.contadores(),
    ]);

    const condominios = tenants.map((t): WhatsappCondominioResumo => {
      const cfg = mergedConfig(t);
      const c = counts.get(t.id) ?? { encomenda: 0, aviso: 0 };
      return {
        id: t.id,
        nome: t.nome,
        slug: t.slug,
        ativo: t.ativo,
        provisionado: Boolean(t.whatsappSessionId),
        status: t.whatsappStatus,
        conectado: t.whatsappStatus === 'ready',
        numero: t.whatsappNumero,
        disparosEncomenda: c.encomenda,
        disparosAviso: c.aviso,
        intervaloSegundos: cfg.whatsappIntervaloSegundos,
        jitterSegundos: cfg.whatsappJitterSegundos,
        limiteDiario: cfg.whatsappLimiteDiario,
        horarioEnvioInicio: cfg.horarioEnvioInicio,
        horarioEnvioFim: cfg.horarioEnvioFim,
        templateEncomenda: cfg.whatsappTemplateEncomenda || '',
        templateRetirada: cfg.whatsappTemplateRetirada || '',
      };
    });

    return {
      variaveis: VARIAVEIS_ENCOMENDA,
      templatePadrao: DEFAULT_TEMPLATE_ENCOMENDA,
      variaveisRetirada: VARIAVEIS_RETIRADA,
      templatePadraoRetirada: DEFAULT_TEMPLATE_RETIRADA,
      condominios,
    };
  }

  async atualizar(tenantId: string, dto: AtualizarWhatsappConfigDto): Promise<WhatsappCondominioResumo> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');

    const cfg = mergedConfig(tenant);
    if (dto.intervaloSegundos !== undefined) cfg.whatsappIntervaloSegundos = dto.intervaloSegundos;
    if (dto.jitterSegundos !== undefined) cfg.whatsappJitterSegundos = dto.jitterSegundos;
    if (dto.limiteDiario !== undefined) cfg.whatsappLimiteDiario = dto.limiteDiario;
    if (dto.horarioEnvioInicio !== undefined) cfg.horarioEnvioInicio = dto.horarioEnvioInicio;
    if (dto.horarioEnvioFim !== undefined) cfg.horarioEnvioFim = dto.horarioEnvioFim;
    if (dto.templateEncomenda !== undefined) cfg.whatsappTemplateEncomenda = dto.templateEncomenda;
    if (dto.templateRetirada !== undefined) cfg.whatsappTemplateRetirada = dto.templateRetirada;

    tenant.configJson = { ...(tenant.configJson ?? {}), ...cfg };
    await this.tenantRepo.save(tenant);

    const { condominios } = await this.listar();
    const found = condominios.find((c) => c.id === tenantId);
    return found!;
  }
}
