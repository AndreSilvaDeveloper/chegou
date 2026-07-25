import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { AuthenticatedUser, JwtPayload } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.authService.findActiveUserById(payload.sub);
    if (!user) throw new UnauthorizedException('Sessão inválida');
    // Carregado do banco a cada request: desativar o usuário ou tirá-lo da
    // carteira vale na hora, sem esperar o token expirar.
    return {
      id: user.id,
      tenantId: user.tenantId,
      tenantNome: user.tenant?.nome ?? null,
      administradoraId: user.administradoraId,
      administradoraNome: user.administradora?.nome ?? null,
      role: user.role,
      nome: user.nome,
      email: user.email,
    };
  }
}
