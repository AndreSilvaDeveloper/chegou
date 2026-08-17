import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';
import { Tenant, User } from '../../database/entities';
import { aplicarEndereco } from '../../common/endereco.dto';
import { OpenwaService } from '../openwa/openwa.service';
import { AtualizarTenantDto } from './dto/atualizar-tenant.dto';
import { CriarTenantDto } from './dto/criar-tenant.dto';
import { DEFAULT_TENANT_CONFIG } from './dto/config-tenant.dto';
import { TenantConfigService } from '../../common/tenant-config/tenant-config.service';
import { TenantScopeService } from '../../common/tenant-scope/tenant-scope.service';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly openwa: OpenwaService,
    private readonly tenantConfig: TenantConfigService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  async listarTenants(): Promise<Array<Tenant & { qtdUsuarios: number }>> {
    const tenants = await this.tenantRepo.find({ order: { nome: 'ASC' } });
    const counts = await this.userRepo
      .createQueryBuilder('u')
      .select('u.tenantId', 'tenantId')
      .addSelect('COUNT(*)::int', 'count')
      .where('u.tenantId IS NOT NULL')
      .groupBy('u.tenantId')
      .getRawMany<{ tenantId: string; count: number }>();
    const byTenant = Object.fromEntries(counts.map((r) => [r.tenantId, r.count]));
    return tenants.map((t) => ({ ...t, qtdUsuarios: byTenant[t.id] ?? 0 }));
  }

  async obterTenant(id: string): Promise<Tenant & { usuarios: User[] }> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    const usuarios = await this.userRepo.find({
      where: { tenantId: id, ativo: true },
      order: { role: 'ASC', nome: 'ASC' },
    });
    return { ...tenant, usuarios };
  }

  /**
   * Cria o condomínio e o primeiro síndico.
   *
   * `administradoraId` vem de quem chama, nunca do corpo da request: o
   * superadmin escolhe a carteira, e a administradora só consegue criar dentro
   * da própria.
   */
  async criarTenant(dto: CriarTenantDto, administradoraId: string | null = null): Promise<Tenant> {
    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const senhaHash = await bcrypt.hash(dto.sindicoSenha, rounds);

    try {
      const tenant = await this.tenantRepo.save(
        this.tenantRepo.create({
          administradoraId,
          nome: dto.nome,
          slug: dto.slug,
          documento: dto.documento ?? null,
          cidade: dto.cidade ?? null,
          estado: dto.estado ?? null,
          plano: 'basico',
          ativo: true,
          configJson: { ...DEFAULT_TENANT_CONFIG },
        }),
      );
      await this.userRepo.save(
        this.userRepo.create({
          tenantId: tenant.id,
          nome: dto.sindicoNome,
          email: dto.sindicoEmail,
          senhaHash,
          role: 'sindico',
          ativo: true,
        }),
      );

      // Provisiona a instância WhatsApp (OpenWA) do condomínio — best-effort,
      // nunca bloqueia o cadastro se o gateway estiver indisponível.
      await this.openwa.provisionForTenant(tenant.id);

      return await this.tenantRepo.findOneOrFail({ where: { id: tenant.id } });
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Slug, documento ou e-mail do síndico já em uso');
      }
      throw err;
    }
  }

  async atualizarTenant(id: string, dto: AtualizarTenantDto): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    if (dto.nome !== undefined) tenant.nome = dto.nome;
    if (dto.slug !== undefined) tenant.slug = dto.slug;
    if (dto.documento !== undefined) tenant.documento = dto.documento || null;
    aplicarEndereco(tenant, dto);
    if (dto.plano !== undefined) tenant.plano = dto.plano;
    if (dto.ativo !== undefined) tenant.ativo = dto.ativo;
    if (dto.configJson !== undefined) {
      // O class-transformer materializa TODO campo declarado no ConfigTenantDto,
      // inclusive os que não vieram no corpo, com valor `undefined`. Espalhar o
      // DTO cru sobrescreveria a config existente com undefined — e o JSONB
      // descarta essas chaves, apagando o que já estava salvo. Só o que veio
      // de fato pode entrar no merge.
      const alteracoes = Object.fromEntries(
        Object.entries(dto.configJson).filter(([, valor]) => valor !== undefined),
      );
      tenant.configJson = {
        ...DEFAULT_TENANT_CONFIG,
        ...(tenant.configJson ?? {}),
        ...alteracoes,
      };
    }
    try {
      const salvo = await this.tenantRepo.save(tenant);
      // Ligar/desligar um módulo precisa valer na próxima request, não depois do TTL.
      this.tenantConfig.invalidate(id);
      // Idem para desativar o condomínio: o escopo por request também é cacheado.
      this.tenantScope.invalidate(id);
      return salvo;
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Slug ou documento já em uso por outro condomínio');
      }
      throw err;
    }
  }

  async assertTenantExists(id: string): Promise<void> {
    const exists = await this.tenantRepo.exists({ where: { id } });
    if (!exists) throw new NotFoundException('Condomínio não encontrado');
  }
}
