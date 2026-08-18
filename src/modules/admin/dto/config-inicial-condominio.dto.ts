import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * As perguntas de configuração feitas **no cadastro** do condomínio.
 *
 * É o quarto passo do `CondominioWizard`, e vale para os dois perfis que
 * cadastram: o superadmin (`POST /admin/tenants`) e a administradora
 * (`POST /minha-administradora/condominios`).
 *
 * O conjunto é menor que o `ConfigTenantDto` de propósito: aqui entram só as
 * perguntas que alguém sabe responder **no momento do cadastro** e que mudam o
 * comportamento do sistema desde o primeiro dia. Ritmo de disparo, jitter e
 * cota diária ficam de fora — são afinação anti-bloqueio, têm tela própria
 * (`/whatsapp`) e ninguém tem opinião sobre eles antes de o condomínio existir.
 *
 * **`moduloVagas` é a exceção deliberada à regra de "módulo é contrato".**
 * Em toda rota de *edição* ele é só do superadmin (ver
 * `ConfigOperacionalCondominioDto`): quem paga a fatura não liga o próprio
 * módulo. No cadastro ele entra porque "este condomínio tem garagem para
 * administrar?" é a resposta que a administradora tem em mãos na hora, e
 * obrigá-la a abrir chamado para o primeiro condomínio da carteira era o
 * caminho mais rápido para o módulo nunca ser usado. Ligar ali é declarar o
 * que o condomínio é; **desligar depois continua sendo da plataforma**.
 *
 * `moduloAvisos` **não** entra: nada no cadastro pergunta por ele, e um
 * segundo interruptor sem pergunta correspondente só reabriria a porta que a
 * regra fecha.
 */
export class ConfigInicialCondominioDto {
  @IsOptional()
  @IsIn(['residencial', 'comercial', 'misto'])
  tipo?: 'residencial' | 'comercial' | 'misto';

  @IsOptional()
  @IsIn(['unico', 'multiplos'])
  estruturaBlocos?: 'unico' | 'multiplos';

  /**
   * Janela em que a portaria recebe encomendas — e, por consequência, a janela
   * em que o WhatsApp do condomínio dispara.
   *
   * O par é validado no service (`mesclarConfigOperacional`), não aqui: cada
   * horário sozinho passa no regex, mas quem diz se a janela é válida são os
   * dois juntos, e ela precisa caber em 08:00–21:00.
   */
  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioInicio?: string;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioFim?: string;

  @IsOptional()
  @IsBoolean()
  moduloVagas?: boolean;
}
