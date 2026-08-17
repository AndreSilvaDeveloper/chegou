import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { TenantConfigService } from '../../common/tenant-config/tenant-config.service';
import { mesclarConfigOperacional } from './config-operacional';
import { AtualizarMeuCondominioDto } from './dto/atualizar-meu-condominio.dto';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * O condomínio do próprio síndico.
 *
 * O `tenantId` sempre vem do `TenantScopeGuard` (`@TenantId()`), nunca da URL
 * nem do corpo: não existe id para adulterar, e por isso não há checagem de
 * carteira aqui — o guard já garantiu que o condomínio é o do vínculo do
 * usuário logado.
 */
@Injectable()
export class MeuCondominioService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly tenantConfig: TenantConfigService,
  ) {}

  async obter(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    return tenant;
  }

  async atualizar(tenantId: string, dto: AtualizarMeuCondominioDto): Promise<Tenant> {
    const tenant = await this.obter(tenantId);

    // Campo a campo, e não `Object.assign(tenant, dto)`: o update genérico faria
    // um campo novo do DTO virar caminho para trocar `id`, `ativo` ou `plano`.
    if (dto.nome !== undefined) tenant.nome = dto.nome;
    if (dto.documento !== undefined) tenant.documento = dto.documento || null;
    if (dto.cidade !== undefined) tenant.cidade = dto.cidade || null;
    if (dto.estado !== undefined) tenant.estado = dto.estado || null;
    if (dto.endereco !== undefined) tenant.endereco = dto.endereco || null;
    if (dto.telefoneContato !== undefined) tenant.telefoneContato = dto.telefoneContato || null;
    if (dto.emailContato !== undefined) tenant.emailContato = dto.emailContato || null;

    if (dto.configJson !== undefined) {
      tenant.configJson = mesclarConfigOperacional(tenant.configJson, { ...dto.configJson });
    }

    try {
      const salvo = await this.tenantRepo.save(tenant);

      // `estruturaBlocos` decide se o cadastro de unidade exige bloco, e o
      // `TenantConfigService` guarda isso em cache: sem invalidar, o próprio
      // síndico que acabou de salvar continuaria vendo o formulário antigo.
      if (dto.configJson !== undefined) this.tenantConfig.invalidate(tenantId);

      return salvo;
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Documento já em uso por outro condomínio');
      }
      throw err;
    }
  }
}
