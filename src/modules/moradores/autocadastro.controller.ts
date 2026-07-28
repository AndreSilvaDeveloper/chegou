import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public, Roles, TenantId } from '../../common/decorators';
import { AutocadastroService, DadosAutocadastro } from './autocadastro.service';
import { AutocadastroMoradorDto } from './dto/autocadastro-morador.dto';

/**
 * Página pública de autocadastro (o morador lê o QR e cai aqui, sem login).
 *
 * `@Public()` libera de todos os guards; o condomínio é resolvido pelo token na
 * URL, dentro do service. Nada aqui lê `X-Tenant-Id`.
 */
@Public()
@Controller('public/autocadastro')
export class PublicAutocadastroController {
  constructor(private readonly service: AutocadastroService) {}

  /** Nome do condomínio + unidades para a tela montar o formulário. */
  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  dados(@Param('token') token: string): Promise<DadosAutocadastro> {
    return this.service.dadosPublicos(token);
  }

  /** Efetiva o cadastro. Limite apertado: é escrita anônima. */
  @Post(':token')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  cadastrar(
    @Param('token') token: string,
    @Body() dto: AutocadastroMoradorDto,
  ): Promise<{ ok: true }> {
    return this.service.cadastrar(token, dto);
  }
}

/**
 * Gestão do link de autocadastro pelo condomínio (síndico/administradora).
 * Escopo do tenant do usuário logado — nunca da URL.
 */
@Controller('moradores/autocadastro-link')
@Roles('admin', 'sindico')
export class AutocadastroLinkController {
  constructor(private readonly service: AutocadastroService) {}

  /** Token atual (gera na primeira vez). O front monta a URL a partir dele. */
  @Get()
  obter(@TenantId() tenantId: string): Promise<{ token: string }> {
    return this.service.obterLink(tenantId);
  }

  /** Gera um link novo, invalidando o anterior. */
  @Post('rotate')
  rotacionar(@TenantId() tenantId: string): Promise<{ token: string }> {
    return this.service.rotacionar(tenantId);
  }
}
