import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apenasDigitos, mascaraDocumento } from '@/lib/documento';

export interface DocumentoInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Valor só com dígitos (`12345678000190`) — o formato que a API usa. */
  value: string;
  /** Recebe o valor já sem máscara; string vazia quando o campo é limpo. */
  onChange: (digitos: string) => void;
}

/**
 * Campo de CPF ou CNPJ: digita-se `12.345.678/0001-90`, a API recebe
 * `12345678000190`.
 *
 * Existe pelo mesmo motivo do `PhoneInput`: o campo estava em quatro telas
 * (condomínio novo, condomínio do superadmin, o mesmo condomínio pela
 * administradora e administradora nova), cada uma com o seu `replace(/\D/g,'')`
 * solto, o seu `maxLength` e o seu "Só os números" — uma delas já sem a fonte
 * mono das outras. Documento é dado de cobrança: ele precisa ser digitado do
 * mesmo jeito em todo lugar.
 *
 * **A máscara é da tela; o banco guarda só dígitos** — como o telefone guarda
 * E.164. Pedir "só os números" ao usuário era transferir a ele um detalhe de
 * armazenamento nosso.
 */
export const DocumentoInput = React.forwardRef<HTMLInputElement, DocumentoInputProps>(
  ({ className, value, onChange, placeholder = 'CPF ou CNPJ', ...props }, ref) => {
    const aoDigitar = (e: React.ChangeEvent<HTMLInputElement>) => {
      // O corte em 14 vive na máscara: os dois pontos precisam concordar sobre
      // o teto, senão o campo aceita um dígito que some ao ser exibido.
      onChange(apenasDigitos(e.target.value).slice(0, 14));
    };

    return (
      <Input
        {...props}
        ref={ref}
        inputMode="numeric"
        value={mascaraDocumento(value)}
        onChange={aoDigitar}
        placeholder={placeholder}
        className={cn('font-mono', className)}
      />
    );
  },
);

DocumentoInput.displayName = 'DocumentoInput';
