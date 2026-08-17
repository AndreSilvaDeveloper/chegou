import { BadRequestException } from '@nestjs/common';
import { DEFAULT_TENANT_CONFIG } from '../admin/dto/config-tenant.dto';
import { JANELA_MAXIMA, JANELA_MINIMA } from '../openwa/dto/atualizar-config.dto';

/**
 * Mistura a configuração operacional na que já está salva em `config_json`.
 *
 * Usada por **quem não é o superadmin**: a administradora
 * (`/minha-administradora/condominios/:id`) e o síndico (`/meu-condominio`).
 * Mora aqui, e não dentro de um dos dois services, porque as duas armadilhas
 * abaixo são de segurança — regra duplicada é regra que diverge, e a segunda
 * delas é o que separa "ajustar o horário" de "passar a enviar de madrugada".
 *
 * 1. **Chave `undefined` fica de fora.** O `class-transformer` materializa todo
 *    campo declarado no DTO, inclusive os que não vieram na request; espalhar o
 *    DTO cru apagaria configuração existente, porque o JSONB descarta chave
 *    `undefined`. É a mesma regra do `AdminService`.
 * 2. **A janela de envio é validada como par.** Cada horário sozinho já passa
 *    pelo regex do DTO, mas quem decide se a janela é válida são os dois
 *    juntos — e ela precisa caber dentro da faixa anti-bloqueio, igual à tela
 *    `/whatsapp`.
 *
 * A validação da janela roda mesmo quando quem chama não deixa a janela ser
 * editada (o síndico não deixa): ela é a rede, não a regra. Quem decide o que
 * pode ser enviado é o DTO de cada rota — campo não declarado vira 400 no
 * `forbidNonWhitelisted`, antes de chegar aqui.
 */
export function mesclarConfigOperacional(
  atual: Record<string, unknown> | null,
  entrada: Record<string, unknown>,
): Record<string, unknown> {
  const informado = Object.fromEntries(
    Object.entries(entrada).filter(([, valor]) => valor !== undefined),
  );
  const mesclado = { ...(atual ?? {}), ...informado };

  if ('horarioEnvioInicio' in informado || 'horarioEnvioFim' in informado) {
    const efetivo = { ...DEFAULT_TENANT_CONFIG, ...mesclado };
    const inicio = String(efetivo.horarioEnvioInicio);
    const fim = String(efetivo.horarioEnvioFim);

    if (inicio < JANELA_MINIMA || fim > JANELA_MAXIMA) {
      throw new BadRequestException(
        `A janela de envio precisa ficar entre ${JANELA_MINIMA} e ${JANELA_MAXIMA}`,
      );
    }
    if (inicio >= fim) {
      throw new BadRequestException('O horário de início precisa ser antes do de término');
    }
  }

  return mesclado;
}
