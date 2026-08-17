import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apenasDigitosCep, mascaraCep } from '@/lib/cep';

export interface CepInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Valor só com dígitos (`36010000`) — o formato que a API usa. */
  value: string;
  /** Recebe o valor já sem máscara; string vazia quando o campo é limpo. */
  onChange: (digitos: string) => void;
}

/**
 * Campo de CEP: digita-se `36010-000`, a API recebe `36010000`.
 *
 * Irmão do `PhoneInput` e do `DocumentoInput`, pelo mesmo motivo: a máscara é da
 * tela e o banco guarda o dado cru. Quem dispara a consulta é quem usa o campo
 * (`EnderecoFields`), não o componente — assim ele continua servindo a um
 * cadastro que só queira guardar o CEP, sem buscar nada.
 */
export const CepInput = React.forwardRef<HTMLInputElement, CepInputProps>(
  ({ className, value, onChange, placeholder = '00000-000', ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      inputMode="numeric"
      value={mascaraCep(value)}
      onChange={(e) => onChange(apenasDigitosCep(e.target.value))}
      placeholder={placeholder}
      className={cn('font-mono', className)}
    />
  ),
);

CepInput.displayName = 'CepInput';
