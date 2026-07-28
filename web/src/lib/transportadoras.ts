/**
 * Transportadoras que mais aparecem numa portaria brasileira.
 *
 * POR QUE UMA LISTA, SE O CAMPO ACEITA TEXTO LIVRE
 * O relatório agrupa as encomendas **por transportadora** (`/relatorios`). Com
 * digitação livre, "Correios", "correios" e "CORREIOS" viram três linhas
 * diferentes e o número perde o sentido. A lista faz o caminho comum cair
 * sempre na mesma grafia; quem não está aqui (transportadora regional, motoboy
 * da loja) continua podendo ser digitado — ver `Combobox`.
 *
 * POR QUE O NOME PRECISA BATER COM O DO LEITOR DE CÓDIGO
 * `detectarTransportadora()` (em `pages/NovaEncomenda.tsx`) preenche o campo
 * sozinho ao escanear o pacote. Se ele devolvesse "Azul Cargo Express" e aqui
 * estivesse "Azul Cargo", o mesmo pacote ficaria com grafias diferentes
 * conforme fosse escaneado ou digitado — e o relatório voltaria a se dividir.
 * O tipo `TransportadoraNome` existe para isso: o detector devolve esse tipo,
 * então um nome fora desta lista **não compila**.
 *
 * Ao acrescentar uma transportadora: use o nome como o morador o lê na etiqueta,
 * e ponha em `busca` a sigla/apelido que o porteiro provavelmente digita.
 */
export interface Transportadora {
  nome: string;
  /** Sigla ou apelido que também encontra a opção ao digitar. */
  busca?: string;
}

export const TRANSPORTADORAS = [
  { nome: 'Correios', busca: 'ect sedex pac' },
  { nome: 'Mercado Livre', busca: 'ml mercado envios meli' },
  { nome: 'Shopee', busca: 'spx' },
  { nome: 'Amazon', busca: 'tba' },
  { nome: 'Magalu', busca: 'magazine luiza logbee' },
  { nome: 'AliExpress', busca: 'ali' },
  { nome: 'Shein', busca: '' },
  { nome: 'Loggi', busca: '' },
  { nome: 'Jadlog', busca: '' },
  { nome: 'Total Express', busca: '' },
  { nome: 'J&T Express', busca: 'jt' },
  { nome: 'Braspress', busca: '' },
  { nome: 'Azul Cargo', busca: 'azul cargo express' },
  { nome: 'Rodonaves', busca: 'rte' },
  { nome: 'Jamef', busca: '' },
  { nome: 'Sequoia', busca: '' },
  { nome: 'Direct', busca: 'direct log' },
  { nome: 'Patrus', busca: 'patrus transportes' },
  { nome: 'Rapidão Cometa', busca: 'cometa' },
  { nome: 'GOL Log', busca: 'gollog' },
  { nome: 'LATAM Cargo', busca: 'tam cargo' },
  { nome: 'DHL', busca: '' },
  { nome: 'FedEx', busca: '' },
  { nome: 'UPS', busca: '' },
  { nome: 'TNT', busca: 'tnt mercurio' },
  { nome: 'iFood', busca: '' },
  { nome: 'Rappi', busca: '' },
  { nome: 'Motoboy / entrega particular', busca: 'moto particular loja' },
] as const satisfies readonly Transportadora[];

/** Nomes válidos da lista — o que o leitor de código pode devolver. */
export type TransportadoraNome = (typeof TRANSPORTADORAS)[number]['nome'];

/** Opções no formato do `Combobox`. */
export const OPCOES_TRANSPORTADORA = TRANSPORTADORAS.map((t) => ({
  valor: t.nome,
  busca: t.busca || undefined,
}));
