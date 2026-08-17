import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { Administradora, Tenant, User } from '../../database/entities';
import { aplicarEndereco } from '../../common/endereco.dto';
import { TenantConfigService } from '../../common/tenant-config/tenant-config.service';
import { TenantScopeService } from '../../common/tenant-scope/tenant-scope.service';
import { AdminService } from '../admin/admin.service';
import { CriarTenantDto } from '../admin/dto/criar-tenant.dto';
import { mesclarConfigOperacional } from '../condominio/config-operacional';
import {
  AtualizarAdministradoraDto,
  CriarAdministradoraDto,
  CriarUsuarioAdminDto,
} from './dto/administradora.dto';
import { AtualizarCondominioDto } from './dto/condominio.dto';

const PG_UNIQUE_VIOLATION = '23505';

export interface AdministradoraComResumo extends Administradora {
  qtdCondominios: number;
  qtdUsuarios: number;
}

/**
 * Carteira de condomínios de cada administradora.
 *
 * Todo método que recebe `administradoraId` trata esse valor como a fronteira
 * do que existe: nada é buscado "por id" sem amarrar à carteira, então uma
 * administradora não consegue nem confirmar a existência de condomínio alheio.
 */
@Injectable()
export class AdministradorasService {
  constructor(
    @InjectRepository(Administradora) private readonly repo: Repository<Administradora>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly admin: AdminService,
    private readonly tenantScope: TenantScopeService,
    private readonly tenantConfig: TenantConfigService,
  ) {}

  // ------------------------------------------------------------ superadmin

  async listar(): Promise<AdministradoraComResumo[]> {
    const administradoras = await this.repo.find({ order: { nome: 'ASC' } });
    if (administradoras.length === 0) return [];

    const condominios = await this.tenantRepo
      .createQueryBuilder('t')
      .select('t.administradoraId', 'administradoraId')
      .addSelect('COUNT(*)::int', 'count')
      .where('t.administradora_id IS NOT NULL')
      .groupBy('t.administradoraId')
      .getRawMany<{ administradoraId: string; count: number }>();

    const usuarios = await this.userRepo
      .createQueryBuilder('u')
      .select('u.administradoraId', 'administradoraId')
      .addSelect('COUNT(*)::int', 'count')
      .where('u.administradora_id IS NOT NULL')
      .andWhere('u.ativo = true')
      .groupBy('u.administradoraId')
      .getRawMany<{ administradoraId: string; count: number }>();

    const porCarteira = Object.fromEntries(condominios.map((r) => [r.administradoraId, r.count]));
    const porUsuarios = Object.fromEntries(usuarios.map((r) => [r.administradoraId, r.count]));

    return administradoras.map((a) => ({
      ...a,
      qtdCondominios: porCarteira[a.id] ?? 0,
      qtdUsuarios: porUsuarios[a.id] ?? 0,
    }));
  }

  async obter(id: string): Promise<Administradora & { condominios: Tenant[]; usuarios: User[] }> {
    const administradora = await this.repo.findOne({ where: { id } });
    if (!administradora) throw new NotFoundException('Administradora não encontrada');
    return {
      ...administradora,
      condominios: await this.listarCondominios(id),
      usuarios: await this.listarUsuarios(id),
    };
  }

  async criar(dto: CriarAdministradoraDto): Promise<Administradora> {
    try {
      return await this.repo.save(
        this.repo.create({
          nome: dto.nome,
          documento: dto.documento ?? null,
          emailContato: dto.emailContato ?? null,
          telefoneContato: dto.telefoneContato ?? null,
          ativo: true,
        }),
      );
    } catch (err) {
      throw this.traduzirUnique(err, 'Documento já cadastrado em outra administradora');
    }
  }

  async atualizar(id: string, dto: AtualizarAdministradoraDto): Promise<Administradora> {
    const administradora = await this.repo.findOne({ where: { id } });
    if (!administradora) throw new NotFoundException('Administradora não encontrada');

    if (dto.nome !== undefined) administradora.nome = dto.nome;
    if (dto.documento !== undefined) administradora.documento = dto.documento || null;
    if (dto.emailContato !== undefined) administradora.emailContato = dto.emailContato || null;
    if (dto.telefoneContato !== undefined) {
      administradora.telefoneContato = dto.telefoneContato || null;
    }
    if (dto.ativo !== undefined) administradora.ativo = dto.ativo;

    try {
      return await this.repo.save(administradora);
    } catch (err) {
      throw this.traduzirUnique(err, 'Documento já cadastrado em outra administradora');
    }
  }

  /** Condomínios ainda sem carteira — candidatos a vínculo pelo superadmin. */
  async listarCondominiosSemCarteira(): Promise<Tenant[]> {
    return this.tenantRepo.find({ where: { administradoraId: IsNull() }, order: { nome: 'ASC' } });
  }

  async vincularCondominio(administradoraId: string, tenantId: string): Promise<Tenant> {
    await this.assertExiste(administradoraId);
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');

    tenant.administradoraId = administradoraId;
    const salvo = await this.tenantRepo.save(tenant);
    // O escopo por request é cacheado: sem invalidar, o acesso recém-concedido
    // (ou revogado) só valeria depois do TTL.
    this.tenantScope.invalidate(tenantId);
    return salvo;
  }

  async desvincularCondominio(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    tenant.administradoraId = null;
    const salvo = await this.tenantRepo.save(tenant);
    this.tenantScope.invalidate(tenantId);
    return salvo;
  }

  // ------------------------------------------------- carteira (admin e superadmin)

  async obterPropria(administradoraId: string): Promise<Administradora> {
    return this.assertExiste(administradoraId);
  }

  async listarCondominios(administradoraId: string): Promise<Tenant[]> {
    return this.tenantRepo.find({ where: { administradoraId }, order: { nome: 'ASC' } });
  }

  async listarUsuarios(administradoraId: string): Promise<User[]> {
    return this.userRepo.find({
      where: { administradoraId },
      order: { ativo: 'DESC', nome: 'ASC' },
    });
  }

  /** Condomínio da carteira — 404 quando é de outra, para não vazar existência. */
  async obterCondominioDaCarteira(administradoraId: string, tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId, administradoraId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado na sua carteira');
    return tenant;
  }

  /** Cria o condomínio já dentro da carteira, com o primeiro síndico. */
  async criarCondominio(administradoraId: string, dto: CriarTenantDto): Promise<Tenant> {
    const administradora = await this.assertExiste(administradoraId);
    if (!administradora.ativo) {
      throw new ForbiddenException('Administradora desativada não pode criar condomínios');
    }
    const tenant = await this.admin.criarTenant(dto, administradoraId);
    this.tenantScope.invalidate(tenant.id);
    return tenant;
  }

  async atualizarCondominio(
    administradoraId: string,
    tenantId: string,
    dto: AtualizarCondominioDto,
  ): Promise<Tenant> {
    const tenant = await this.obterCondominioDaCarteira(administradoraId, tenantId);

    if (dto.nome !== undefined) tenant.nome = dto.nome;
    if (dto.documento !== undefined) tenant.documento = dto.documento || null;
    aplicarEndereco(tenant, dto);
    if (dto.telefoneContato !== undefined) tenant.telefoneContato = dto.telefoneContato || null;
    if (dto.emailContato !== undefined) tenant.emailContato = dto.emailContato || null;

    if (dto.configJson !== undefined) {
      tenant.configJson = mesclarConfigOperacional(tenant.configJson, { ...dto.configJson });
    }

    try {
      const salvo = await this.tenantRepo.save(tenant);

      // `estruturaBlocos` decide se o cadastro de unidade exige bloco, e o
      // `TenantConfigService` guarda isso em cache: sem invalidar, a mudança só
      // valeria depois do TTL — e o síndico veria o formulário antigo.
      if (dto.configJson !== undefined) this.tenantConfig.invalidate(tenantId);

      return salvo;
    } catch (err) {
      throw this.traduzirUnique(err, 'Documento já em uso por outro condomínio');
    }
  }

  /**
   * Usuário da administradora: sempre `admin`, sempre sem condomínio.
   *
   * O papel não vem do corpo da request — é isso que impede a rota de virar
   * atalho para criar superadmin ou usuário de condomínio alheio.
   */
  async criarUsuario(administradoraId: string, dto: CriarUsuarioAdminDto): Promise<User> {
    await this.assertExiste(administradoraId);
    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    try {
      const salvo = await this.userRepo.save(
        this.userRepo.create({
          tenantId: null,
          administradoraId,
          nome: dto.nome,
          email: dto.email,
          senhaHash: await bcrypt.hash(dto.senha, rounds),
          role: 'admin',
          telefone: dto.telefone ?? null,
          ativo: true,
        }),
      );
      return await this.userRepo.findOneOrFail({ where: { id: salvo.id } });
    } catch (err) {
      throw this.traduzirUnique(err, 'E-mail já em uso');
    }
  }

  async desativarUsuario(administradoraId: string, userId: string): Promise<{ ok: true }> {
    const user = await this.userRepo.findOne({ where: { id: userId, administradoraId } });
    if (!user) throw new NotFoundException('Usuário não encontrado nesta administradora');
    user.ativo = false;
    await this.userRepo.save(user);
    return { ok: true };
  }

  // ------------------------------------------------------------- internos

  private async assertExiste(id: string): Promise<Administradora> {
    const administradora = await this.repo.findOne({ where: { id } });
    if (!administradora) throw new NotFoundException('Administradora não encontrada');
    return administradora;
  }

  private traduzirUnique(err: unknown, mensagem: string): Error {
    if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return new ConflictException(mensagem);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
