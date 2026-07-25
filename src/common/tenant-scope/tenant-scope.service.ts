import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { AuthenticatedUser } from '../../modules/auth/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TenantResumo {
  id: string;
  ativo: boolean;
  administradoraId: string | null;
}

/**
 * Resolve em qual condomínio a request está operando.
 *
 * Só existe uma regra, e ela vale para todo mundo: **o escopo nunca vem do
 * cliente sem passar por validação**. Quem tem condomínio fixo (síndico,
 * porteiro) ignora o pedido do cliente; quem tem carteira (administradora)
 * escolhe pelo header, mas só dentro da própria carteira; o superadmin escolhe
 * qualquer um.
 */
@Injectable()
export class TenantScopeService {
  private static readonly TTL_MS = 30_000;

  private readonly cache = new Map<string, { tenant: TenantResumo | null; expiraEm: number }>();

  constructor(@InjectRepository(Tenant) private readonly repo: Repository<Tenant>) {}

  private async obterTenant(tenantId: string): Promise<TenantResumo | null> {
    const agora = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiraEm > agora) return hit.tenant;

    const encontrado = await this.repo.findOne({
      where: { id: tenantId },
      select: { id: true, ativo: true, administradoraId: true },
    });
    const tenant = encontrado
      ? { id: encontrado.id, ativo: encontrado.ativo, administradoraId: encontrado.administradoraId }
      : null;
    this.cache.set(tenantId, { tenant, expiraEm: agora + TenantScopeService.TTL_MS });
    return tenant;
  }

  /** Vínculo de condomínio mudou (criação, troca de carteira, desativação). */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /**
   * Condomínio efetivo da request, ou `null` quando não há um (superadmin e
   * administradora sem condomínio escolhido). Lança quando o cliente pede um
   * condomínio que não pode acessar.
   */
  async resolver(user: AuthenticatedUser, pedido: string | undefined): Promise<string | null> {
    const solicitado = pedido?.trim() || undefined;
    if (solicitado && !UUID_REGEX.test(solicitado)) {
      throw new BadRequestException('Header X-Tenant-Id inválido');
    }

    // Usuário de condomínio: o vínculo manda, o header não. Pedir outro
    // condomínio é tentativa de escapar do próprio tenant — 403, não silêncio.
    if (user.role === 'sindico' || user.role === 'porteiro') {
      if (solicitado && solicitado !== user.tenantId) {
        throw new ForbiddenException('Você só pode operar no seu próprio condomínio');
      }
      return user.tenantId;
    }

    if (!solicitado) return null;

    const tenant = await this.obterTenant(solicitado);

    if (user.role === 'superadmin') {
      if (!tenant) throw new NotFoundException('Condomínio não encontrado');
      return tenant.id;
    }

    if (user.role === 'admin') {
      // Mesma resposta para "não existe" e "não é seu": a administradora não
      // pode descobrir a existência de condomínios de outra carteira.
      if (!tenant || tenant.administradoraId !== user.administradoraId) {
        throw new ForbiddenException('Condomínio fora da sua carteira');
      }
      if (!tenant.ativo) throw new ForbiddenException('Condomínio desativado');
      return tenant.id;
    }

    throw new ForbiddenException('Usuário sem acesso a condomínios');
  }
}
