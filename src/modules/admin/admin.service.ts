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
import { AtualizarTenantDto } from './dto/atualizar-tenant.dto';
import { CriarTenantDto } from './dto/criar-tenant.dto';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
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

  async criarTenant(dto: CriarTenantDto): Promise<Tenant> {
    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const senhaHash = await bcrypt.hash(dto.sindicoSenha, rounds);

    try {
      const tenant = await this.tenantRepo.save(
        this.tenantRepo.create({
          nome: dto.nome,
          slug: dto.slug,
          cnpj: dto.cnpj ?? null,
          cidade: dto.cidade ?? null,
          estado: dto.estado ?? null,
          plano: 'basico',
          ativo: true,
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
      return tenant;
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Slug, CNPJ ou e-mail do síndico já em uso');
      }
      throw err;
    }
  }

  async atualizarTenant(id: string, dto: AtualizarTenantDto): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    if (dto.nome !== undefined) tenant.nome = dto.nome;
    if (dto.slug !== undefined) tenant.slug = dto.slug;
    if (dto.cnpj !== undefined) tenant.cnpj = dto.cnpj || null;
    if (dto.cidade !== undefined) tenant.cidade = dto.cidade || null;
    if (dto.estado !== undefined) tenant.estado = dto.estado || null;
    if (dto.plano !== undefined) tenant.plano = dto.plano;
    if (dto.ativo !== undefined) tenant.ativo = dto.ativo;
    try {
      return await this.tenantRepo.save(tenant);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Slug ou CNPJ já em uso por outro condomínio');
      }
      throw err;
    }
  }

  async assertTenantExists(id: string): Promise<void> {
    const exists = await this.tenantRepo.exists({ where: { id } });
    if (!exists) throw new NotFoundException('Condomínio não encontrado');
  }
}
