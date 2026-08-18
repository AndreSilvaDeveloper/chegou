import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building2, Clock, MapPin, SlidersHorizontal, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import type { Tenant, TenantConfig, TenantTipo } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DocumentoInput } from '@/components/ui/documento-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { SwitchField } from '@/components/ui/switch';
import {
  ESTRUTURA_META,
  OptionCard,
  TIPO_META,
  estruturaSugerida,
} from '@/components/condominio/condominio-shared';
import {
  ENDERECO_VAZIO,
  EnderecoFields,
  enderecoParaApi,
  type EnderecoForm,
} from '@/components/condominio/EnderecoFields';
import { cepCompleto } from '@/lib/cep';
import { documentoCompleto } from '@/lib/documento';
import { mensagemErro } from '@/lib/erros';
import { cn } from '@/lib/utils';

/**
 * Cadastro de condomínio, em três passos.
 *
 * **Um componente para as duas telas.** O superadmin cadastra em `/admin`
 * (`POST /admin/tenants`) e a administradora na carteira dela
 * (`POST /minha-administradora/condominios`) — mesmo DTO, mesma validação, mesmo
 * primeiro síndico. Só muda o endpoint. Copiado, o formulário divergiria na
 * primeira vez que um campo entrasse só de um lado, e aí condomínio de carteira
 * passaria a nascer com menos dado que condomínio direto.
 *
 * POR QUE PASSOS, E NÃO UM FORMULÁRIO LONGO
 *
 * São quatro assuntos diferentes: o condomínio, onde ele fica, quem vai entrar
 * e como ele funciona. Numa coluna só, no celular, o cadastro virava uma
 * rolagem sem fim em que o erro de validação aparecia longe do campo. Cada
 * passo valida o que é dele antes de deixar avançar, então o erro chega junto
 * do que o causou.
 *
 * **O passo 4 existe para o condomínio nascer configurado.** Antes ele nascia
 * sempre residencial, de bloco único, com a janela padrão e sem Vagas — e a
 * primeira coisa que a administradora fazia era abrir a tela de configuração
 * para arrumar isso. As quatro perguntas são as que alguém sabe responder no
 * ato do cadastro; ritmo de disparo e cota diária não são, e continuam na tela
 * `/whatsapp`.
 *
 * **O slug não está aqui de propósito.** Ele é gerado no servidor a partir do
 * nome, que é o único lugar que sabe se ele está livre — ver `common/slug.ts` e
 * `AdminService.slugUnico`. Antes ele era um campo visível nas duas telas, com
 * uma cópia diferente da mesma função de sugestão em cada uma.
 */

interface Passo {
  titulo: string;
  descricao: string;
  icone: typeof Building2;
}

const PASSOS: Passo[] = [
  {
    titulo: 'Informações gerais',
    descricao: 'Como o condomínio se identifica e por onde falamos com ele.',
    icone: Building2,
  },
  {
    titulo: 'Endereço',
    descricao: 'Digite o CEP e o resto é preenchido sozinho.',
    icone: MapPin,
  },
  {
    titulo: 'Síndico responsável',
    descricao: 'O primeiro acesso do condomínio. Ele pode criar os demais depois.',
    icone: UserCog,
  },
  {
    titulo: 'Configurações',
    descricao: 'Como este condomínio funciona. Tudo aqui pode mudar depois.',
    icone: SlidersHorizontal,
  },
];

const GERAL_VAZIO = { nome: '', documento: '', emailContato: '', telefoneContato: '' };
const SINDICO_VAZIO = { nome: '', email: '', senha: '', telefone: '' };

/** O que o passo 4 pergunta — os mesmos padrões que o servidor usaria sozinho. */
type ConfigInicial = {
  tipo: TenantTipo;
  estruturaBlocos: NonNullable<TenantConfig['estruturaBlocos']>;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  moduloVagas: boolean;
};

const CONFIG_VAZIA: ConfigInicial = {
  tipo: 'residencial',
  estruturaBlocos: 'multiplos',
  horarioEnvioInicio: '08:00',
  horarioEnvioFim: '21:00',
  moduloVagas: false,
};

/**
 * A faixa anti-bloqueio, repetida aqui só para o erro aparecer **antes** do
 * envio. Quem manda continua sendo o servidor (`mesclarConfigOperacional`):
 * mensagem de madrugada é o que derruba o número do condomínio, e essa regra
 * não pode depender de nenhuma tela.
 */
const JANELA_MINIMA = '08:00';
const JANELA_MAXIMA = '21:00';

/**
 * O que cada opção significa, em uma linha.
 *
 * Mora aqui e não no `condominio-shared` porque é texto de **cadastro**: nas
 * telas de configuração o usuário já sabe o que é o condomínio dele, e o mesmo
 * texto ali seria explicação do óbvio.
 */
const TIPO_DESCRICAO: Record<TenantTipo, string> = {
  residencial: 'Apartamentos e casas.',
  comercial: 'Salas, lojas e escritórios.',
  misto: 'Moradia e comércio no mesmo endereço.',
};

const ESTRUTURA_DESCRICAO: Record<NonNullable<TenantConfig['estruturaBlocos']>, string> = {
  unico: 'Uma torre só — a unidade é só o número.',
  multiplos: 'Torres ou blocos — a unidade tem bloco e número.',
};

/** Checagem só de forma — quem recusa de verdade é o DTO. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CondominioWizard({
  open,
  onOpenChange,
  endpoint,
  onCriado,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** `/admin/tenants` (superadmin) ou `/minha-administradora/condominios`. */
  endpoint: string;
  onCriado: (tenant: Tenant) => void;
}) {
  const [passo, setPasso] = useState(0);
  const [geral, setGeral] = useState(GERAL_VAZIO);
  const [endereco, setEndereco] = useState<EnderecoForm>(ENDERECO_VAZIO);
  const [sindico, setSindico] = useState(SINDICO_VAZIO);
  const [config, setConfig] = useState<ConfigInicial>(CONFIG_VAZIA);

  const limpar = () => {
    setPasso(0);
    setGeral(GERAL_VAZIO);
    setEndereco(ENDERECO_VAZIO);
    setSindico(SINDICO_VAZIO);
    setConfig(CONFIG_VAZIA);
  };

  const criar = useMutation({
    mutationFn: () =>
      api.post<Tenant>(endpoint, {
        nome: geral.nome.trim(),
        // Sem `slug`: o servidor gera a partir do nome e garante que é único.
        documento: geral.documento,
        emailContato: geral.emailContato.trim(),
        telefoneContato: geral.telefoneContato,
        ...enderecoParaApi(endereco),
        sindicoNome: sindico.nome.trim(),
        sindicoEmail: sindico.email.trim(),
        sindicoSenha: sindico.senha,
        sindicoTelefone: sindico.telefone,
        // Mesclado por cima dos padrões no servidor — o que não está aqui
        // (ritmo de disparo, cota diária, avisos) continua vindo do padrão.
        configJson: config,
      }),
    onSuccess: (tenant) => {
      toast.success('Condomínio criado.');
      limpar();
      onOpenChange(false);
      onCriado(tenant);
    },
    onError: (err: unknown) => toast.error(mensagemErro(err, 'Não foi possível criar o condomínio')),
  });

  /**
   * O que falta no passo atual — string vazia quando ele está completo.
   *
   * Uma função só, e não `disabled` espalhado por campo: assim o botão de
   * avançar consegue **dizer** o que falta em vez de ficar apagado sem
   * explicação, que é o pior desfecho de formulário em etapas.
   */
  const pendencia = (indice: number): string => {
    if (indice === 0) {
      if (!geral.nome.trim()) return 'Informe o nome do condomínio';
      if (!documentoCompleto(geral.documento)) return 'Informe o CNPJ (ou CPF) completo';
      if (!EMAIL_RE.test(geral.emailContato.trim())) return 'Informe um e-mail de contato válido';
      if (!geral.telefoneContato) return 'Informe o telefone de contato';
      return '';
    }
    if (indice === 1) {
      if (!cepCompleto(endereco.cep)) return 'Informe o CEP completo';
      if (!endereco.endereco.trim()) return 'Informe o logradouro';
      if (!endereco.numero.trim()) return 'Informe o número';
      if (!endereco.cidade.trim()) return 'Informe a cidade';
      if (endereco.estado.trim().length !== 2) return 'Informe a UF';
      return '';
    }
    if (indice === 2) {
      if (!sindico.nome.trim()) return 'Informe o nome do síndico';
      if (!EMAIL_RE.test(sindico.email.trim())) return 'Informe um e-mail de acesso válido';
      if (sindico.senha.length < 6) return 'A senha do síndico precisa ter ao menos 6 caracteres';
      if (!sindico.telefone) return 'Informe o telefone do síndico';
      return '';
    }
    // A janela é validada como PAR: cada horário sozinho é válido, e quem diz
    // se a janela presta são os dois juntos.
    if (!config.horarioEnvioInicio || !config.horarioEnvioFim) {
      return 'Informe o horário de recebimento de encomendas';
    }
    if (config.horarioEnvioInicio < JANELA_MINIMA || config.horarioEnvioFim > JANELA_MAXIMA) {
      return `O horário precisa ficar entre ${JANELA_MINIMA} e ${JANELA_MAXIMA}`;
    }
    if (config.horarioEnvioInicio >= config.horarioEnvioFim) {
      return 'O horário de início precisa ser antes do de término';
    }
    return '';
  };

  const avancar = () => {
    const falta = pendencia(passo);
    if (falta) return toast.error(falta);
    setPasso((p) => p + 1);
  };

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    // Confere todos: dá para chegar ao último passo e voltar para apagar um campo.
    for (let i = 0; i < PASSOS.length; i++) {
      const falta = pendencia(i);
      if (falta) {
        setPasso(i);
        return toast.error(falta);
      }
    }
    criar.mutate();
  };

  const atual = PASSOS[passo];
  const Icone = atual.icone;
  const ultimo = passo === PASSOS.length - 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        if (!aberto && !criar.isPending) limpar();
        onOpenChange(aberto);
      }}
    >
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Novo condomínio</DialogTitle>
          <DialogDescription>
            O condomínio e o primeiro síndico são criados juntos.
          </DialogDescription>
        </DialogHeader>

        {/* Trilha de progresso. Sem âmbar: o sinal é do botão de ação, que fica
            na mesma dobra — dois âmbares e o botão deixa de saltar. */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="txt-subtitulo font-semibold text-foreground">{atual.titulo}</p>
            <span className="tabular txt-nota text-muted-foreground">
              Passo {passo + 1} de {PASSOS.length}
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden>
            {PASSOS.map((p, i) => (
              <span
                key={p.titulo}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= passo ? 'bg-foreground/70' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </div>

        <form onSubmit={submeter} className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-muted p-3">
            <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="txt-apoio text-muted-foreground">{atual.descricao}</p>
          </div>

          {passo === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cond-nome">Nome do condomínio *</Label>
                <Input
                  id="cond-nome"
                  placeholder="Residencial Aurora"
                  value={geral.nome}
                  onChange={(e) => setGeral({ ...geral, nome: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cond-documento">CNPJ ou CPF *</Label>
                  <DocumentoInput
                    id="cond-documento"
                    value={geral.documento}
                    onChange={(documento) => setGeral({ ...geral, documento })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cond-telefone">Telefone de contato *</Label>
                  <PhoneInput
                    id="cond-telefone"
                    value={geral.telefoneContato}
                    onChange={(e164) => setGeral({ ...geral, telefoneContato: e164 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cond-email">E-mail de contato *</Label>
                <Input
                  id="cond-email"
                  type="email"
                  placeholder="contato@condominio.com.br"
                  value={geral.emailContato}
                  onChange={(e) => setGeral({ ...geral, emailContato: e.target.value })}
                />
                <p className="txt-apoio text-muted-foreground">
                  É por aqui que o condomínio recebe o link de pagamento da assinatura.
                </p>
              </div>
            </div>
          )}

          {passo === 1 && <EnderecoFields valor={endereco} onChange={setEndereco} obrigatorio />}

          {passo === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sindico-nome">Nome do síndico *</Label>
                <Input
                  id="sindico-nome"
                  placeholder="Nome completo"
                  value={sindico.nome}
                  onChange={(e) => setSindico({ ...sindico, nome: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sindico-email">E-mail de acesso *</Label>
                  <Input
                    id="sindico-email"
                    type="email"
                    placeholder="sindico@exemplo.com"
                    value={sindico.email}
                    onChange={(e) => setSindico({ ...sindico, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sindico-telefone">Telefone do síndico *</Label>
                  <PhoneInput
                    id="sindico-telefone"
                    value={sindico.telefone}
                    onChange={(e164) => setSindico({ ...sindico, telefone: e164 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sindico-senha">Senha inicial *</Label>
                <Input
                  id="sindico-senha"
                  type="password"
                  placeholder="mín. 6 caracteres"
                  value={sindico.senha}
                  onChange={(e) => setSindico({ ...sindico, senha: e.target.value })}
                />
                <p className="txt-apoio text-muted-foreground">
                  Combine com ele — o síndico troca a senha depois, no perfil.
                </p>
              </div>
            </div>
          )}

          {passo === 3 && (
            <div className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="txt-subtitulo font-semibold text-foreground">
                  Qual o tipo de condomínio?
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(Object.keys(TIPO_META) as TenantTipo[]).map((tipo) => (
                    <OptionCard
                      key={tipo}
                      active={config.tipo === tipo}
                      // Escolher o tipo já sugere a estrutura — comercial
                      // costuma ser bloco único. Continua trocável logo abaixo.
                      onClick={() =>
                        setConfig({
                          ...config,
                          tipo,
                          estruturaBlocos: estruturaSugerida(tipo),
                        })
                      }
                      icon={TIPO_META[tipo].icon}
                      title={TIPO_META[tipo].label}
                      description={TIPO_DESCRICAO[tipo]}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="txt-subtitulo font-semibold text-foreground">
                  Como as unidades são organizadas?
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    Object.keys(ESTRUTURA_META) as NonNullable<TenantConfig['estruturaBlocos']>[]
                  ).map((estrutura) => (
                    <OptionCard
                      key={estrutura}
                      active={config.estruturaBlocos === estrutura}
                      onClick={() => setConfig({ ...config, estruturaBlocos: estrutura })}
                      icon={ESTRUTURA_META[estrutura].icon}
                      title={ESTRUTURA_META[estrutura].label}
                      description={ESTRUTURA_DESCRICAO[estrutura]}
                    />
                  ))}
                </div>
                <p className="txt-apoio text-muted-foreground">
                  É isto que decide se o cadastro de unidade pede o bloco.
                </p>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="txt-subtitulo font-semibold text-foreground">
                  Horário de recebimento de encomendas
                </legend>
                <p className="txt-apoio text-muted-foreground">
                  É a janela em que a portaria recebe — e em que o morador é avisado pelo
                  WhatsApp. Ela precisa caber entre {JANELA_MINIMA} e {JANELA_MAXIMA}: avisar de
                  madrugada é o que derruba o número do condomínio.
                </p>
                <div className="grid max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cfg-envio-inicio">Início *</Label>
                    <Input
                      id="cfg-envio-inicio"
                      type="time"
                      min={JANELA_MINIMA}
                      max={JANELA_MAXIMA}
                      value={config.horarioEnvioInicio}
                      onChange={(e) =>
                        setConfig({ ...config, horarioEnvioInicio: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cfg-envio-fim">Término *</Label>
                    <Input
                      id="cfg-envio-fim"
                      type="time"
                      min={JANELA_MINIMA}
                      max={JANELA_MAXIMA}
                      value={config.horarioEnvioFim}
                      onChange={(e) => setConfig({ ...config, horarioEnvioFim: e.target.value })}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="txt-subtitulo font-semibold text-foreground">
                  Gestão de vagas
                </legend>
                {/* Sem moldura em volta: o interruptor já lê como ajuste do
                    cadastro, e um bloco aqui o anunciaria como seção à parte. */}
                <SwitchField
                  label="Este condomínio administra vagas de garagem"
                  description="Liga o módulo de vagas: cadastro, locação e cobrança mensal."
                  checked={config.moduloVagas}
                  onCheckedChange={(moduloVagas) => setConfig({ ...config, moduloVagas })}
                />
              </fieldset>

              <div className="flex items-start gap-3 rounded-lg bg-muted p-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="txt-apoio text-muted-foreground">
                  Nada aqui é definitivo: tipo, blocos e horário ficam na tela de configuração do
                  condomínio.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => (passo === 0 ? onOpenChange(false) : setPasso((p) => p - 1))}
              disabled={criar.isPending}
            >
              {passo === 0 ? 'Cancelar' : 'Voltar'}
            </Button>
            {ultimo ? (
              <Button type="submit" loading={criar.isPending}>
                Criar condomínio
              </Button>
            ) : (
              <Button type="button" onClick={avancar}>
                Continuar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
