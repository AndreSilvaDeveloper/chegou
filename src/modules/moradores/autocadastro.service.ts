import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { Apartamento, Tenant } from '../../database/entities';
import { AutocadastroMoradorDto } from './dto/autocadastro-morador.dto';
import { MoradoresService } from './moradores.service';

/** Estrutura de blocos do condomínio (mesma dedução do módulo Apartamentos). */
type EstruturaBlocos = 'unico' | 'multiplos';

/** Unidade como a página pública precisa dela — sem nada além do necessário para escolher. */
export interface UnidadePublica {
  id: string;
  bloco: string | null;
  numero: string;
  identificador: string;
}

export interface DadosAutocadastro {
  condominioNome: string;
  estruturaBlocos: EstruturaBlocos;
  unidades: UnidadePublica[];
}

/**
 * Autocadastro de morador via QR Code.
 *
 * O token é a única forma de a rota pública descobrir o condomínio — o
 * `tenantId` jamais vem do cliente. Quem cria de fato o morador é o
 * `MoradoresService`, para não duplicar as regras (apto do condomínio, E.164,
 * principal). Quem entra por aqui é sempre não-principal e recebendo WhatsApp:
 * essas são decisões da gestão, fora da mão de quem se cadastra.
 */
@Injectable()
export class AutocadastroService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Apartamento) private readonly aptoRepo: Repository<Apartamento>,
    private readonly moradores: MoradoresService,
  ) {}

  // ---- Gestão do link (síndico / administradora, autenticado) ----

  /** Token do link; gera na primeira vez. */
  async obterLink(tenantId: string): Promise<{ token: string }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    if (!tenant.autocadastroToken) {
      tenant.autocadastroToken = this.gerarToken();
      await this.tenantRepo.save(tenant);
    }
    return { token: tenant.autocadastroToken };
  }

  /** Gera um token novo e invalida o anterior (link vazado, troca de gestão). */
  async rotacionar(tenantId: string): Promise<{ token: string }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    tenant.autocadastroToken = this.gerarToken();
    await this.tenantRepo.save(tenant);
    return { token: tenant.autocadastroToken };
  }

  // ---- Rota pública (sem login) ----

  /** Dados que a página pública mostra: nome do condomínio e as unidades para escolher. */
  async dadosPublicos(token: string): Promise<DadosAutocadastro> {
    const tenant = await this.resolverTenant(token);
    const unidades = await this.aptoRepo.find({
      where: { tenantId: tenant.id, ativo: true },
      order: { identificador: 'ASC' },
    });
    return {
      condominioNome: tenant.nome,
      estruturaBlocos: this.estruturaBlocos(tenant),
      unidades: unidades.map((a) => ({
        id: a.id,
        bloco: a.bloco,
        numero: a.numero,
        identificador: a.identificador,
      })),
    };
  }

  /** Cria o morador. `tenantId` vem do token, nunca do corpo. */
  async cadastrar(token: string, dto: AutocadastroMoradorDto): Promise<{ ok: true }> {
    const tenant = await this.resolverTenant(token);
    await this.moradores.criar(tenant.id, {
      apartamentoId: dto.apartamentoId,
      nome: dto.nome,
      telefoneE164: dto.telefoneE164,
      documento: dto.documento,
      email: dto.email,
      principal: false,
      receberWhatsapp: true,
    });
    return { ok: true };
  }

  // ---- Internos ----

  /** 404 genérico: link inválido/revogado não deve deixar concluir que existe outro. */
  private async resolverTenant(token: string): Promise<Tenant> {
    const tenant = token
      ? await this.tenantRepo.findOne({ where: { autocadastroToken: token, ativo: true } })
      : null;
    if (!tenant) throw new NotFoundException('Link de cadastro inválido ou expirado');
    return tenant;
  }

  private estruturaBlocos(tenant: Tenant): EstruturaBlocos {
    const config = tenant.configJson ?? {};
    const estrutura = config.estruturaBlocos as EstruturaBlocos | undefined;
    if (estrutura === 'unico' || estrutura === 'multiplos') return estrutura;
    return config.tipo === 'comercial' ? 'unico' : 'multiplos';
  }

  private gerarToken(): string {
    return randomBytes(16).toString('hex'); // 32 chars, URL-safe
  }
}
