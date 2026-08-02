import { IsIn } from 'class-validator';
import type { TipoCliente } from '../assinatura-clientes.service';

/**
 * O tipo do cliente que vem no path de `/clientes/:tipo/:id/sincronizar`.
 *
 * Condomínio e administradora são os dois UUID, então o id sozinho não diz de
 * qual tabela ele é. Sem o tipo, um id trocado responderia "não encontrado"
 * (parecendo cadastro faltando) em vez de simplesmente procurar no lugar certo.
 */
export class SincronizarClienteParams {
  @IsIn(['condominio', 'administradora'], {
    message: 'tipo deve ser condominio ou administradora',
  })
  tipo!: TipoCliente;
}
