import { IsIn, IsUUID } from 'class-validator';
import type { TipoCliente } from '../assinatura-clientes.service';

/**
 * Os params do path de `/clientes/:tipo/:id/sincronizar`.
 *
 * Condomínio e administradora são os dois UUID, então o id sozinho não diz de
 * qual tabela ele é. Sem o tipo, um id trocado responderia "não encontrado"
 * (parecendo cadastro faltando) em vez de simplesmente procurar no lugar certo.
 *
 * > **Os DOIS params precisam estar aqui.** `@Param()` sem chave entrega o
 * > objeto inteiro de params, e o `ValidationPipe` global roda com
 * > `forbidNonWhitelisted: true` — um campo do path que falte no DTO vira
 * > *"property id should not exist"*, um 400 que não diz nada sobre a causa.
 */
export class SincronizarClienteParams {
  @IsIn(['condominio', 'administradora'], {
    message: 'tipo deve ser condominio ou administradora',
  })
  tipo!: TipoCliente;

  @IsUUID('4', { message: 'id do cliente inválido' })
  id!: string;
}
