import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apenasDigitos, mascaraTelefone, nacionalDeE164, paraE164 } from '@/lib/telefone';

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Valor em E.164 (`+5532999999999`) — o formato que a API usa. */
  value: string;
  /** Recebe o valor já em E.164; string vazia quando o campo é limpo. */
  onChange: (e164: string) => void;
}

/**
 * Campo de telefone: digita-se `(32) 99999-9999`, a API recebe `+5532999999999`.
 *
 * O DDI é detalhe técnico e some da tela — ninguém na portaria deveria precisar
 * saber o que é E.164. Quem tem número de fora do Brasil digita começando com
 * `+` e o campo respeita, sem aplicar a máscara brasileira.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, placeholder = '(32) 99999-9999', ...props }, ref) => {
    const internacional = value.startsWith('+') && !value.startsWith('+55');
    const exibicao = internacional ? value : mascaraTelefone(nacionalDeE164(value));

    const aoDigitar = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digitado = e.target.value;

      // Começou com "+": número de outro país, vai como está.
      if (digitado.trim().startsWith('+')) {
        onChange(paraE164(digitado));
        return;
      }

      const digitos = apenasDigitos(digitado).slice(0, 11);
      onChange(digitos ? paraE164(digitos) : '');
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="tel"
        inputMode={internacional ? 'text' : 'numeric'}
        autoComplete="tel"
        value={exibicao}
        onChange={aoDigitar}
        placeholder={placeholder}
        className={cn('font-mono', className)}
      />
    );
  },
);

PhoneInput.displayName = 'PhoneInput';
