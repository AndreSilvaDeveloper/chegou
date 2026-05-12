import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser, JwtPayload } from './types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    tokenType: 'Bearer';
    user: AuthenticatedUser;
  }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.senhaHash')
      .leftJoinAndSelect('u.tenant', 't')
      .where('u.email = :email', { email: dto.email })
      .andWhere('u.ativo = true')
      .getOne();

    if (!user || !(await bcrypt.compare(dto.senha, user.senhaHash))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        tenantId: user.tenantId,
        tenantNome: user.tenant?.nome ?? null,
        role: user.role,
        nome: user.nome,
        email: user.email,
      },
    };
  }

  async findActiveUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id, ativo: true }, relations: { tenant: true } });
  }

  async hashPassword(plain: string): Promise<string> {
    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    return bcrypt.hash(plain, rounds);
  }
}
