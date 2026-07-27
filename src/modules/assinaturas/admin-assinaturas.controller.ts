import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { AssinaturaFaturasService } from './assinatura-faturas.service';
import { AssinaturasService } from './assinaturas.service';
import { CriarCondicaoDto, EncerrarCondicaoDto, QueryCondicoesDto } from './dto/condicoes.dto';
import { DefinirFaixasDto } from './dto/faixas.dto';
import {
  CancelarFaturaDto,
  GerarFaturasDto,
  PagarFaturaDto,
  QueryFaturasDto,
} from './dto/faturas.dto';

/**
 * A assinatura do lado de quem cobra: tabela de preços, preço especial e as
 * faturas do mês.
 *
 * **Só o superadmin entra aqui** — é a receita da plataforma. O cliente vê a
 * própria fatura por outras rotas (fase 3): a administradora em
 * `/minha-administradora/assinatura` e o síndico na do próprio condomínio.
 *
 * Não há `X-Tenant-Id` neste controller: o recorte não é o condomínio da
 * request, é o cliente escolhido pelo superadmin em cada rota.
 */
@Controller('admin/assinaturas')
@Roles('superadmin')
export class AdminAssinaturasController {
  constructor(
    private readonly assinaturas: AssinaturasService,
    private readonly faturas: AssinaturaFaturasService,
  ) {}

  // ------------------------------------------------------------ tabela de preços

  @Get('faixas')
  listarFaixas() {
    return this.assinaturas.faixas();
  }

  /** Substitui a tabela inteira. Não mexe em fatura já emitida. */
  @Put('faixas')
  definirFaixas(@Body() dto: DefinirFaixasDto) {
    return this.assinaturas.definirFaixas(dto);
  }

  // -------------------------------------------------------------------- prévia

  /** Quanto entra se o mês fechar hoje, cliente a cliente. */
  @Get('previas')
  previas() {
    return this.assinaturas.listarPrevias();
  }

  @Get('previas/condominio/:tenantId')
  previaDoCondominio(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.assinaturas.previaDoCondominio(tenantId);
  }

  @Get('previas/administradora/:administradoraId')
  previaDaAdministradora(@Param('administradoraId', ParseUUIDPipe) administradoraId: string) {
    return this.assinaturas.previaDaAdministradora(administradoraId);
  }

  // ------------------------------------------------------------- preço especial

  @Get('condicoes')
  listarCondicoes(@Query() query: QueryCondicoesDto) {
    return this.assinaturas.listarCondicoes(query);
  }

  @Post('condicoes')
  criarCondicao(@Body() dto: CriarCondicaoDto) {
    return this.assinaturas.criarCondicao(dto);
  }

  @Post('condicoes/:id/encerrar')
  encerrarCondicao(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EncerrarCondicaoDto) {
    return this.assinaturas.encerrarCondicao(id, dto);
  }

  // ------------------------------------------------------------------- faturas

  /** Cards da tela: faturado, recebido, em aberto e vencido. */
  @Get('resumo')
  resumo(@Query('competencia') competencia?: string) {
    return this.faturas.resumo(competencia);
  }

  @Get('faturas')
  listarFaturas(@Query() query: QueryFaturasDto) {
    return this.faturas.listar(query);
  }

  /** Emite as faturas da competência. Rodar de novo não duplica. */
  @Post('faturas/gerar')
  gerarFaturas(@Body() dto: GerarFaturasDto) {
    return this.faturas.gerar(dto);
  }

  // Rota fixa antes da curinga: `/faturas/gerar` precisa vir antes de `/faturas/:id`.
  @Get('faturas/:id')
  obterFatura(@Param('id', ParseUUIDPipe) id: string) {
    return this.faturas.obter(id);
  }

  @Post('faturas/:id/pagar')
  pagarFatura(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PagarFaturaDto) {
    return this.faturas.pagar(id, dto);
  }

  @Post('faturas/:id/cancelar')
  cancelarFatura(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelarFaturaDto) {
    return this.faturas.cancelar(id, dto);
  }
}
