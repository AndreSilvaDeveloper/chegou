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
 * **`moduloVagas` entra porque o cadastro pergunta por ele** ("este condomínio
 * administra vagas de garagem?"): é a resposta que quem implanta tem em mãos, e
 * o condomínio já nasce com o módulo certo em vez de exigir uma segunda visita
 * à tela de configuração. Ele não é mais privilégio do superadmin — a
 * administradora liga e desliga os dois módulos pela rota da carteira (ver
 * `ConfigOperacionalCondominioDto`).
 *
 * `moduloAvisos` fica de fora **por falta de pergunta**, não por falta de
 * permissão: nada no passo 4 pergunta por ele, e campo aceito sem pergunta
 * correspondente é campo que ninguém sabe que existe. Ele é ligado logo depois,
 * na tela de configuração.
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
