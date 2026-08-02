import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { AssinaturaClientesService } from './assinatura-clientes.service';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import { AssinaturaFaturasService } from './assinatura-faturas.service';
import { AssinaturasService } from './assinaturas.service';
import { ConciliacaoService } from './conciliacao.service';
import { CupomFaturaService } from './cupom-fatura.service';
import { CuponsService } from '../pagamentos/cupons.service';
import { SincronizarClienteParams } from './dto/clientes-gateway.dto';
import { AtribuirCupomDto, CriarCupomDto } from './dto/cupons.dto';
import { AtualizarPoliticaAcessoDto } from './dto/politica-acesso.dto';
import { FilaCobrancaService } from './fila-cobranca.service';
import { PoliticaAcessoService } from './politica-acesso.service';
import { DefinirDiaVencimentoDto } from './dto/cobranca.dto';
import { CriarCondicaoDto, EncerrarCondicaoDto, QueryCondicoesDto } from './dto/condicoes.dto';
import { DefinirFaixasDto, TipoClienteQueryDto } from './dto/faixas.dto';
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
    private readonly clientes: AssinaturaClientesService,
    private readonly faturaCobrancas: AssinaturaCobrancasService,
    private readonly filaCobranca: FilaCobrancaService,
    private readonly conciliacao: ConciliacaoService,
    private readonly politica: PoliticaAcessoService,
    private readonly cupons: CuponsService,
    private readonly cupomFatura: CupomFaturaService,
  ) {}

  // ------------------------------------------------------------ tabela de preços

  /**
   * A tabela de preços de um tipo de cliente.
   *
   * O `tipo` é obrigatório de propósito: são duas tabelas, e um padrão
   * silencioso faria a tela da administradora abrir mostrando os preços do
   * condomínio sem ninguém perceber.
   */
  @Get('faixas')
  listarFaixas(@Query() query: TipoClienteQueryDto) {
    return this.assinaturas.faixas(query.tipo);
  }

  /** Substitui a tabela **daquele tipo**. Não mexe em fatura já emitida. */
  @Put('faixas')
  definirFaixas(@Query() query: TipoClienteQueryDto, @Body() dto: DefinirFaixasDto) {
    return this.assinaturas.definirFaixas(query.tipo, dto);
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

  // ------------------------------------------------- a conta de um condomínio

  /**
   * Tudo o que a aba "Assinatura" do condomínio mostra: conta, preço especial,
   * vencimento e histórico de cobrança — inclusive quando quem paga por ele é a
   * administradora.
   */
  @Get('condominios/:tenantId')
  contaDoCondominio(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.faturas.contaDoCondominio(tenantId);
  }

  /**
   * Dia do vencimento deste condomínio (`null` volta ao padrão da plataforma).
   *
   * Vale da próxima geração em diante: fatura emitida não muda de vencimento.
   * Devolve a conta inteira para a tela não precisar de uma segunda chamada.
   */
  @Patch('condominios/:tenantId/vencimento')
  async definirVencimento(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: DefinirDiaVencimentoDto,
  ) {
    await this.assinaturas.definirDiaVencimento(tenantId, dto.diaVencimento);
    return this.faturas.contaDoCondominio(tenantId);
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

  // ------------------------------------------------------------------ cobrança

  /**
   * Emite a cobrança de uma fatura, agora.
   *
   * Serve para o caminho de conserto: a emissão normal é a fila, disparada pela
   * geração. Uma fatura já emitida devolve o que tem, sem tocar no gateway —
   * é a primeira das três camadas de idempotência.
   */
  @Post('faturas/:id/emitir-cobranca')
  emitirCobranca(@Param('id', ParseUUIDPipe) id: string) {
    return this.faturaCobrancas.emitir(id);
  }

  /**
   * Reenfileira tudo que ficou sem cobrança.
   *
   * Existe para o dia em que o gateway passou a manhã fora: em vez de clicar
   * fatura por fatura, uma varredura recolhe as que estão em `pendente`, `erro`
   * ou `desligada` e devolve para a fila.
   */
  @Post('cobrancas/reemitir')
  async reemitirPendentes() {
    const ids = await this.faturaCobrancas.pendentesDeEmissao();
    await this.filaCobranca.enfileirar(ids);
    return { enfileiradas: ids.length };
  }

  /**
   * Confere agora, contra o gateway, o estado de toda cobrança viva.
   *
   * A rotina roda sozinha de hora em hora; esta rota é para quando alguém
   * suspeita de divergência e não quer esperar. Divergência **aplica o estado
   * do gateway e registra no `audit_log`** — nunca corrige no outro sentido.
   */
  @Post('cobrancas/conciliar')
  conciliar() {
    return this.conciliacao.conciliar();
  }

  /**
   * O que a conciliação encontrou e não conserta sozinha.
   *
   * Duas listas que pedem gente: fatura em aberto há mais de 24h que nunca
   * virou cobrança (a emissão já tem fila e retry, então repetir não resolve) e
   * baixa nossa que o gateway ainda não confirmou.
   */
  @Get('cobrancas/pendencias')
  async pendenciasDeCobranca() {
    const [semCobranca, dessincronizadas] = await Promise.all([
      this.conciliacao.faturasSemCobranca(),
      this.conciliacao.dessincronizadas(),
    ]);
    return {
      semCobranca: semCobranca.map((f) => this.faturas.resumirParaPendencia(f)),
      dessincronizadas: dessincronizadas.map((f) => this.faturas.resumirParaPendencia(f)),
    };
  }

  // -------------------------------------------------------------------- cupons

  /**
   * Os cupons da plataforma — **proxy da Payment API**.
   *
   * Listar, criar e desativar acontecem lá: o cupom é de lá, e guardar uma
   * cópia aqui criaria duas fontes da verdade que divergem no primeiro erro de
   * rede. `usageCount` e `currentlyValid` vêm prontos de lá também.
   *
   * **Não há rota de cupom para o cliente.** Ele não digita código em lugar
   * nenhum: quem concede é o superadmin, como já é com preço especial.
   */
  @Get('cupons')
  listarCupons() {
    return this.cupons.listar();
  }

  @Post('cupons')
  criarCupom(@Body() dto: CriarCupomDto) {
    return this.cupons.criar(dto);
  }

  @Post('cupons/:id/desativar')
  desativarCupom(@Param('id') id: string) {
    return this.cupons.desativar(Number(id));
  }

  @Post('cupons/:id/reativar')
  reativarCupom(@Param('id') id: string) {
    return this.cupons.reativar(Number(id));
  }

  /** Quem usa qual cupom — esta parte é nossa. */
  @Get('cupons/atribuicoes')
  listarAtribuicoes() {
    return this.cupomFatura.listarAtribuicoes();
  }

  @Post('cupons/atribuir')
  atribuirCupom(@Body() dto: AtribuirCupomDto) {
    return this.cupomFatura.atribuir(dto);
  }

  @Post('cupons/remover')
  async removerCupom(@Body() dto: AtribuirCupomDto) {
    await this.cupomFatura.remover(dto.tipo, dto.clienteId);
    return { ok: true };
  }

  // ------------------------------------------------- política de bloqueio

  /**
   * A política de bloqueio por inadimplência.
   *
   * Devolve também `bloqueioAtivo`, que **não** é a política: é o interruptor
   * `PAYMENT_BLOQUEIO_ATIVO`. Política configurada com o bloqueio desligado é
   * exatamente o estado em que esta funcionalidade sobe.
   */
  @Get('politica-acesso')
  obterPolitica() {
    return this.politica.obter();
  }

  @Put('politica-acesso')
  atualizarPolitica(@Body() dto: AtualizarPoliticaAcessoDto) {
    return this.politica.atualizar(dto);
  }

  // ------------------------------------------------------- cliente no gateway

  /**
   * Quem hoje não teria cobrança possível, e por quê.
   *
   * Não chama o gateway: é leitura do nosso cadastro, então a tela abre rápido
   * e continua abrindo com a API de pagamento fora do ar — que é justamente
   * quando alguém vai querer olhar esta lista.
   */
  @Get('clientes/pendencias')
  pendenciasDeClientes() {
    return this.clientes.pendencias();
  }

  /**
   * Cria (ou atualiza) o cliente no gateway de pagamento.
   *
   * O `tipo` está no path, e não só o id, porque condomínio e administradora
   * são ambos UUID: sem ele, um id trocado viraria "não encontrado" em vez de
   * ir para o cliente certo. O plano escrevia `/clientes/:id/sincronizar`; a
   * ambiguidade só apareceu na hora de implementar.
   */
  @Post('clientes/:tipo/:id/sincronizar')
  sincronizarCliente(@Param() params: SincronizarClienteParams) {
    return this.clientes.sincronizar(params.tipo, params.id);
  }
}
