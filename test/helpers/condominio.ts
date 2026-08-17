/**
 * Fixture de condomínio para os testes e2e.
 *
 * Desde o wizard de três passos, `POST /admin/tenants` exige documento,
 * contatos e endereço completo. Sem isto, cada spec teria a sua própria cópia
 * desse corpo — e a primeira que esquecesse um campo novo falharia com um 400
 * que não diz nada sobre o que o teste queria provar.
 */

/**
 * Um CNPJ **válido de verdade**, com os dígitos verificadores calculados.
 *
 * Não dá para usar `11111111111111` nem um número inventado: o
 * `@DocumentoBrasileiro()` confere os verificadores, e a coluna é única — daí a
 * base aleatória, que também evita colisão entre execuções que não limparam o
 * banco.
 */
export function cnpjDeTeste(): string {
  const digitos: number[] = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));

  const verificador = (ate: number): number => {
    let soma = 0;
    let peso = 2;
    for (let i = ate - 1; i >= 0; i--) {
      soma += digitos[i] * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  digitos.push(verificador(12));
  digitos.push(verificador(13));
  return digitos.join('');
}

/**
 * O corpo mínimo aceito por `POST /admin/tenants` (e pelas rotas de carteira).
 *
 * O `slug` continua sendo passado de fora nos testes de propósito: em produção
 * ele é gerado pelo servidor, mas aqui um slug fixo por fixture deixa o dado do
 * teste previsível quando algo falha.
 */
export function corpoCondominio(dados: {
  nome: string;
  slug: string;
  sindicoNome: string;
  sindicoEmail: string;
  sindicoSenha: string;
}) {
  return {
    ...dados,
    documento: cnpjDeTeste(),
    emailContato: `contato-${dados.slug}@e2e.test`,
    telefoneContato: '(32) 99999-1000',
    cep: '36010-000',
    endereco: 'Rua Halfeld',
    numero: '1179',
    bairro: 'Centro',
    cidade: 'Juiz de Fora',
    estado: 'MG',
    sindicoTelefone: '(32) 99999-2000',
  };
}
