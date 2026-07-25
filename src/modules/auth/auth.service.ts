import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Tenant, User } from '../../database/entities';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser, JwtPayload, TenantAtivo } from './types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Dados do usuário logado + configurações do condomínio em que ele está
   * operando. O front usa isso para adaptar telas (ex.: estrutura de blocos) e
   * para montar o menu com os módulos contratados.
   *
   * Para a administradora o condomínio vem do escopo da request, não de um
   * vínculo: trocar de condomínio no seletor troca a config aqui.
   */
  async me(
    user: AuthenticatedUser,
    tenantEscopo: string | null,
  ): Promise<
    AuthenticatedUser & { config: Record<string, unknown>; tenantAtivo: TenantAtivo | null }
  > {
    const tenantId = tenantEscopo ?? user.tenantId;
    if (!tenantId) return { ...user, config: {}, tenantAtivo: null };

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
      select: { id: true, nome: true, configJson: true },
    });
    return {
      ...user,
      config: tenant?.configJson ?? {},
      tenantAtivo: tenant ? { id: tenant.id, nome: tenant.nome } : null,
    };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    user: AuthenticatedUser & { config: Record<string, unknown> };
  }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.senhaHash')
      .leftJoinAndSelect('u.tenant', 't')
      .leftJoinAndSelect('u.administradora', 'adm')
      .where('u.email = :email', { email: dto.email })
      .andWhere('u.ativo = true')
      .getOne();

    if (!user || !(await bcrypt.compare(dto.senha, user.senhaHash))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken);
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Token inválido');
      }

      const user = await this.findActiveUserById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado ou inativo');
      }

      return this.generateTokens(user);
    } catch (e) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    
    // Refresh token lasts 7 days
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        tenantNome: user.tenant?.nome ?? null,
        administradoraId: user.administradoraId,
        administradoraNome: user.administradora?.nome ?? null,
        role: user.role,
        nome: user.nome,
        email: user.email,
        // Vai junto no login para o front já montar o menu com os módulos
        // certos, sem esperar o /auth/me. A administradora ainda não escolheu
        // condomínio neste ponto, então vem vazio de propósito.
        config: user.tenant?.configJson ?? {},
      },
    };
  }

  async findActiveUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id, ativo: true },
      relations: { tenant: true, administradora: true },
    });
  }

  async hashPassword(plain: string): Promise<string> {
    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    return bcrypt.hash(plain, rounds);
  }
}
