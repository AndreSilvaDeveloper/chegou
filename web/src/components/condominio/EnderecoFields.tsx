import { useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { api } from '@/api/client';
import type { EnderecoPorCep } from '@/api/types';
import { CepInput } from '@/components/ui/cep-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cepCompleto } from '@/lib/cep';

/**
 * O endereço do condomínio, do jeito que as três telas editam.
 *
 * Síndico (`/configuracoes`), administradora (`/meus-condominios/:id`) e
 * superadmin (`/admin/condominios/:id`) editam o **mesmo** endereço. Antes de
 * existir esta peça o conjunto já divergia: duas telas tinham um campo
 * "Endereço" de texto livre, a do superadmin não tinha nenhum, e o CEP não
 * aparecia em lugar nenhum apesar de a coluna existir no banco desde a
 * migration 001.
 */

export interface EnderecoForm {
  cep: string;
  /** Logradouro (rua/avenida), sem número — ver `EnderecoDto` no backend. */
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export const ENDERECO_VAZIO: EnderecoForm = {
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
};

/** O que veio da API virando estado de formulário (sem `null` em campo de texto). */
export function enderecoDoCondominio(c: Partial<Record<keyof EnderecoForm, string | null>>): EnderecoForm {
  return {
    cep: c.cep ?? '',
    endereco: c.endereco ?? '',
    numero: c.numero ?? '',
    complemento: c.complemento ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    estado: c.estado ?? '',
  };
}

/**
 * O formulário virando corpo do PATCH.
 *
 * Campo vazio vai como **string vazia**, não como `undefined`: os três services
 * traduzem `''` para `NULL` e `undefined` para "não mexe". Mandar `undefined`
 * tiraria do usuário a única forma de apagar um complemento errado.
 */
export function enderecoParaApi(e: EnderecoForm): Record<keyof EnderecoForm, string> {
  return {
    cep: e.cep.trim(),
    endereco: e.endereco.trim(),
    numero: e.numero.trim(),
    complemento: e.complemento.trim(),
    bairro: e.bairro.trim(),
    cidade: e.cidade.trim(),
    estado: e.estado.trim().toUpperCase(),
  };
}

type EstadoBusca = 'ocioso' | 'buscando' | 'nao-encontrado';

export function EnderecoFields({
  valor,
  onChange,
  disabled,
}: {
  valor: EnderecoForm;
  onChange: (valor: EnderecoForm) => void;
  disabled?: boolean;
}) {
  const [busca, setBusca] = useState<EstadoBusca>('ocioso');
  const numeroRef = useRef<HTMLInputElement>(null);
  // Guarda o último CEP consultado para não repetir a chamada quando o usuário
  // apaga um dígito e o digita de novo.
  const ultimoBuscado = useRef<string | null>(null);

  /**
   * A consulta sai **de dentro do onChange do CEP**, e não de um efeito.
   *
   * Num efeito sobre `valor.cep` ela dispararia também quando o formulário é
   * carregado com o condomínio que já existe — e sobrescreveria o endereço
   * salvo pelo genérico da base dos Correios. Aqui só o que a pessoa digita
   * busca.
   */
  const aoDigitarCep = async (cep: string) => {
    const proximo = { ...valor, cep };
    onChange(proximo);

    if (!cepCompleto(cep)) {
      setBusca('ocioso');
      return;
    }
    if (ultimoBuscado.current === cep) return;
    ultimoBuscado.current = cep;

    setBusca('buscando');
    try {
      const achado = await api.get<EnderecoPorCep>(`/cep/${cep}`);
      onChange({
        ...proximo,
        // Número e complemento nunca vêm do CEP — preservá-los deixa o usuário
        // digitar na ordem que quiser.
        endereco: achado.endereco ?? proximo.endereco,
        bairro: achado.bairro ?? proximo.bairro,
        cidade: achado.cidade ?? proximo.cidade,
        estado: achado.estado ?? proximo.estado,
      });
      setBusca('ocioso');
      numeroRef.current?.focus();
    } catch {
      // Sem toast: a consulta é conveniência, não etapa. CEP novo demora a
      // entrar na base, e o aviso inline já diz para seguir digitando.
      setBusca('nao-encontrado');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cond-cep">CEP</Label>
        <CepInput
          id="cond-cep"
          value={valor.cep}
          onChange={aoDigitarCep}
          disabled={disabled}
        />
        {busca === 'buscando' && (
          <p className="flex items-center gap-1.5 txt-apoio text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Buscando o endereço…
          </p>
        )}
        {busca === 'nao-encontrado' && (
          <p className="flex items-center gap-1.5 txt-apoio text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Não achamos esse CEP. Preencha o endereço abaixo.
          </p>
        )}
      </div>

      <div className="space-y-2 sm:col-span-4">
        <Label htmlFor="cond-endereco">Logradouro</Label>
        <Input
          id="cond-endereco"
          placeholder="Rua, avenida, estrada"
          value={valor.endereco}
          onChange={(e) => onChange({ ...valor, endereco: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cond-numero">Número</Label>
        <Input
          id="cond-numero"
          ref={numeroRef}
          placeholder="1179 ou s/n"
          value={valor.numero}
          onChange={(e) => onChange({ ...valor, numero: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 sm:col-span-4">
        <Label htmlFor="cond-complemento">Complemento</Label>
        <Input
          id="cond-complemento"
          placeholder="Bloco, torre, referência da portaria"
          value={valor.complemento}
          onChange={(e) => onChange({ ...valor, complemento: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 sm:col-span-3">
        <Label htmlFor="cond-bairro">Bairro</Label>
        <Input
          id="cond-bairro"
          value={valor.bairro}
          onChange={(e) => onChange({ ...valor, bairro: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cond-cidade">Cidade</Label>
        <Input
          id="cond-cidade"
          value={valor.cidade}
          onChange={(e) => onChange({ ...valor, cidade: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 sm:col-span-1">
        <Label htmlFor="cond-uf">UF</Label>
        <Input
          id="cond-uf"
          className="uppercase"
          placeholder="MG"
          maxLength={2}
          value={valor.estado}
          onChange={(e) =>
            onChange({ ...valor, estado: e.target.value.toUpperCase().slice(0, 2) })
          }
          disabled={disabled}
        />
      </div>
    </div>
  );
}
