import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (e164Value: string) => void;
}

// Helpers
function stripNonDigits(str: string) {
  return str.replace(/\D/g, '');
}

function formatBRPhone(digits: string) {
  if (digits.length === 0) return '';
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function toE164(digits: string) {
  if (!digits) return '';
  return `+55${digits}`;
}

function fromE164(e164: string) {
  if (!e164) return '';
  const digits = stripNonDigits(e164);
  if (digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, placeholder = '(11) 90000-0000', ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => {
      const initialDigits = fromE164(value);
      return formatBRPhone(initialDigits);
    });

    React.useEffect(() => {
      const digits = fromE164(value);
      const expectedDisplay = formatBRPhone(digits);
      if (expectedDisplay !== displayValue) {
        setDisplayValue(expectedDisplay);
      }
    }, [value]); // intentionally leaving displayValue out of deps

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputVal = e.target.value;
      const digits = stripNonDigits(inputVal).slice(0, 11);
      const formatted = formatBRPhone(digits);
      
      setDisplayValue(formatted);
      onChange(toE164(digits));
    };

    return (
      <div className={cn('relative flex items-center', className)}>
        <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground select-none">
          +55
        </span>
        <Input
          {...props}
          ref={ref}
          type="tel"
          className="pl-11 min-h-[44px]"
          placeholder={placeholder}
          value={displayValue}
          onChange={handleChange}
        />
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
