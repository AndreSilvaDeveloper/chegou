import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../database/entities';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: { createQueryBuilder: jest.Mock; update: jest.Mock; findOne: jest.Mock };
  let jwtService: { signAsync: jest.Mock };

  const fakeUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    nome: 'Carlos',
    email: 'carlos@x.com',
    senhaHash: '',
    role: 'porteiro' as const,
    ativo: true,
  };

  beforeAll(async () => {
    fakeUser.senhaHash = await bcrypt.hash('senha123', 4);
  });

  beforeEach(async () => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    userRepo = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: () => 12 } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('retorna token + user em credenciais válidas', async () => {
    (userRepo.createQueryBuilder().getOne as jest.Mock).mockResolvedValue(fakeUser);

    const res = await service.login({ email: 'carlos@x.com', senha: 'senha123' });

    expect(res.accessToken).toBe('signed.jwt.token');
    expect(res.user.id).toBe('user-1');
    expect(res.user.role).toBe('porteiro');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1', tenantId: 'tenant-1', role: 'porteiro' }),
    );
  });

  it('rejeita senha errada com 401', async () => {
    (userRepo.createQueryBuilder().getOne as jest.Mock).mockResolvedValue(fakeUser);
    await expect(service.login({ email: 'carlos@x.com', senha: 'errada' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita usuário inexistente com 401 (sem distinguir do "senha errada")', async () => {
    (userRepo.createQueryBuilder().getOne as jest.Mock).mockResolvedValue(null);
    await expect(service.login({ email: 'ghost@x.com', senha: 'senha123' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
