import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Cep } from './cep';

/**
 * Campo de texto que **some quando vem vazio**.
 *
 * O `@IsOptional()` do class-validator pula `null` e `undefined`, mas **não**
 * string vazia — então `estado: ''` chegaria ao `@Matches(/^[A-Z]{2}$/)` e
 * devolveria 400 para quem só apagou a UF. Convertendo para `null` aqui, a
 * validação é pulada e o `aplicarEndereco` grava `NULL`: apagar um campo passa
 * a ser possível, que é o que se espera de um cadastro que se preenche aos
 * poucos.
 */
function TextoOpcional() {
  return Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );
}

/**
 * O endereço completo de um condomínio.
 *
 * Existe como classe-base porque **três rotas editam o mesmo endereço** com
 * poderes diferentes: o síndico (`PATCH /meu-condominio`), a administradora
 * (`PATCH /minha-administradora/condominios/:id`) e o superadmin
 * (`PATCH /admin/tenants/:id`). Copiado nos três DTOs, o conjunto já divergia
 * antes de existir — o do superadmin não tinha `endereco` nenhum, e o `cep` não
 * estava em lugar algum apesar de a coluna existir desde a migration 001.
 *
 * `endereco` é o **logradouro** (rua/avenida), sem número. O nome ficou por
 * compatibilidade com o dado já gravado e com o `addressStreet` do gateway de
 * cobrança — ver `db/migrations/035_endereco_completo_tenant.sql`.
 *
 * Todo campo é opcional, e isso não é descuido: endereço de condomínio é
 * preenchimento incremental (quem cadastra às pressas põe o nome e volta
 * depois), e nenhum deles é usado como chave de nada. O único consumidor
 * automático é o cadastro do cliente no gateway, que já trata campo ausente.
 */
export class EnderecoDto {
  @IsOptional()
  @Cep()
  cep?: string | null;

  /** Logradouro: rua, avenida, estrada. Sem número. */
  @IsOptional()
  @TextoOpcional()
  @IsString()
  @MaxLength(500)
  endereco?: string | null;

  /** Texto, e não inteiro: "s/n", "1179-A" e "KM 12" são endereços válidos. */
  @IsOptional()
  @TextoOpcional()
  @IsString()
  @MaxLength(20)
  numero?: string | null;

  @IsOptional()
  @TextoOpcional()
  @IsString()
  @MaxLength(120)
  complemento?: string | null;

  @IsOptional()
  @TextoOpcional()
  @IsString()
  @MaxLength(120)
  bairro?: string | null;

  @IsOptional()
  @TextoOpcional()
  @IsString()
  @MaxLength(120)
  cidade?: string | null;

  @IsOptional()
  @TextoOpcional()
  @Matches(/^[A-Z]{2}$/, { message: 'UF deve ter 2 letras maiúsculas' })
  estado?: string | null;
}

/** O alvo do `aplicarEndereco` — a parte do `Tenant` que é endereço. */
type AlvoEndereco = {
  [K in keyof EnderecoDto]: string | null;
};

/**
 * Copia o endereço do DTO para a entidade, campo a campo.
 *
 * Campo a campo, e nunca `Object.assign`: o merge genérico faria um campo novo
 * do DTO virar caminho para trocar `id`, `ativo` ou `plano` — é a mesma regra
 * que os três services já seguem para o resto do cadastro.
 *
 * `undefined` (não veio no corpo) preserva o valor atual; campo vazio, que o
 * `TextoOpcional` já converteu em `null`, apaga. Sem essa distinção não haveria
 * como limpar um complemento errado.
 */
export function aplicarEndereco(alvo: AlvoEndereco, dto: EnderecoDto): void {
  if (dto.cep !== undefined) alvo.cep = dto.cep || null;
  if (dto.endereco !== undefined) alvo.endereco = dto.endereco || null;
  if (dto.numero !== undefined) alvo.numero = dto.numero || null;
  if (dto.complemento !== undefined) alvo.complemento = dto.complemento || null;
  if (dto.bairro !== undefined) alvo.bairro = dto.bairro || null;
  if (dto.cidade !== undefined) alvo.cidade = dto.cidade || null;
  if (dto.estado !== undefined) alvo.estado = dto.estado || null;
}
