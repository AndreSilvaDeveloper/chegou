import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Not, QueryFailedError, Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async listar(tenantId: string): Promise<User[]> {
    return this.repo.find({
      where: { tenantId },
      order: { ativo: 'DESC', role: 'ASC', nome: 'ASC' },
    });
  }

  async obter(tenantId: string, id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async criar(tenantId: string, dto: CriarUsuarioDto, allowedRoles: UserRole[]): Promise<User> {
    this.assertRoleAllowed(dto.role, allowedRoles);
    const senhaHash = await this.hash(dto.senha);
    try {
      const saved = await this.repo.save(
        this.repo.create({
          tenantId,
          nome: dto.nome,
          email: dto.email,
          senhaHash,
          role: dto.role,
          telefone: dto.telefone ?? null,
          ativo: true,
        }),
      );
      return this.obter(tenantId, saved.id);
    } catch (err) {
      this.rethrowUnique(err);
    }
  }

  async atualizar(
    tenantId: string,
    id: string,
    dto: AtualizarUsuarioDto,
    allowedRoles: UserRole[],
  ): Promise<User> {
    const user = await this.obter(tenantId, id);

    if (dto.role !== undefined && dto.role !== user.role) {
      this.assertRoleAllowed(dto.role, allowedRoles);
      if (user.role === 'sindico') await this.assertNotLastSindico(tenantId, id);
      user.role = dto.role;
    }
    if (dto.nome !== undefined) user.nome = dto.nome;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.telefone !== undefined) user.telefone = dto.telefone;
    if (dto.ativo !== undefined) {
      if (dto.ativo === false && user.role === 'sindico') await this.assertNotLastSindico(tenantId, id);
      user.ativo = dto.ativo;
    }
    if (dto.senha) user.senhaHash = await this.hash(dto.senha);

    try {
      await this.repo.save(user);
      return this.obter(tenantId, id);
    } catch (err) {
      this.rethrowUnique(err);
    }
  }

  async desativar(tenantId: string, id: string): Promise<{ ok: true }> {
    const user = await this.obter(tenantId, id);
    if (user.role === 'sindico') await this.assertNotLastSindico(tenantId, id);
    user.ativo = false;
    await this.repo.save(user);
    return { ok: true };
  }

  private assertRoleAllowed(role: UserRole, allowed: UserRole[]): void {
    if (!allowed.includes(role)) {
      throw new ForbiddenException(`Você não pode atribuir o papel "${role}"`);
    }
  }

  private async assertNotLastSindico(tenantId: string, excludeId: string): Promise<void> {
    const outros = await this.repo.count({
      where: { tenantId, role: 'sindico', ativo: true, id: Not(excludeId) },
    });
    if (outros < 1) {
      throw new BadRequestException(
        'O condomínio precisa de ao menos um síndico ativo — promova outro antes.',
      );
    }
  }

  private hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.get<number>('BCRYPT_ROUNDS', 12));
  }

  private rethrowUnique(err: unknown): never {
    if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      throw new ConflictException('E-mail já em uso neste condomínio');
    }
    throw err;
  }
}
