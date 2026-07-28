import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Package, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiPublic } from '../api/client';
import { DadosAutocadastro } from '../api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { SearchSelect } from '@/components/ui/search-select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarTelefone } from '@/lib/telefone';
import { mensagemErro } from '@/lib/erros';

type Etapa = 'carregando' | 'invalido' | 'form' | 'revisao' | 'concluido';

interface Campos {
  apartamentoId: string;
  nome: string;
  telefoneE164: string;
  documento: string;
  email: string;
}

const vazio: Campos = { apartamentoId: '', nome: '', telefoneE164: '', documento: '', email: '' };

/**
 * Autocadastro de morador via QR Code — página pública, sem login.
 *
 * Fora do Layout e do ProtectedRoute (ver App.tsx): quem abre não é usuário do
 * painel. O condomínio é resolvido pelo token na URL, no servidor. O passo de
 * "revisão" existe para o morador conferir bloco/unidade antes de gravar — é a
 * rede contra o cadastro na unidade errada.
 */
export function AutocadastroMorador() {
  const { token = '' } = useParams<{ token: string }>();
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [dados, setDados] = useState<DadosAutocadastro | null>(null);
  const [form, setForm] = useState<Campos>(vazio);
  const [erros, setErros] = useState<Partial<Record<keyof Campos, string>>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    apiPublic
      .get<DadosAutocadastro>(`/public/autocadastro/${token}`)
      .then((d) => {
        if (!ativo) return;
        setDados(d);
        setEtapa('form');
      })
      .catch(() => ativo && setEtapa('invalido'));
    return () => {
      ativo = false;
    };
  }, [token]);

  const opcoesUnidade = useMemo(
    () =>
      (dados?.unidades ?? []).map((u) => ({
        value: u.id,
        label: u.identificador,
        busca: u.numero,
      })),
    [dados],
  );

  const unidadeEscolhida = dados?.unidades.find((u) => u.id === form.apartamentoId) ?? null;

  const validar = (): boolean => {
    const e: Partial<Record<keyof Campos, string>> = {};
    if (!form.nome.trim()) e.nome = 'Informe o seu nome';
    if (!form.telefoneE164) e.telefoneE164 = 'Informe o seu WhatsApp';
    if (!form.apartamentoId) e.apartamentoId = 'Escolha a sua unidade';
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const irParaRevisao = () => {
    if (validar()) setEtapa('revisao');
  };

  const confirmar = async () => {
    setEnviando(true);
    try {
      await apiPublic.post(`/public/autocadastro/${token}`, {
        apartamentoId: form.apartamentoId,
        nome: form.nome.trim(),
        telefoneE164: form.telefoneE164,
        documento: form.documento.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      setEtapa('concluido');
    } catch (err) {
      toast.error(mensagemErro(err, 'Não foi possível concluir o cadastro'));
      setEtapa('form');
    } finally {
      setEnviando(false);
    }
  };

  const recomecar = () => {
    setForm(vazio);
    setErros({});
    setEtapa('form');
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <p className="eyebrow text-muted-foreground">Cadastro de morador</p>
          <h1 className="txt-titulo">{dados?.condominioNome ?? 'Chegou'}</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {etapa === 'carregando' && (
            <div className="space-y-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {etapa === 'invalido' && (
            <div className="flex flex-col items-center py-6 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
              <h2 className="txt-secao">Link inválido ou expirado</h2>
              <p className="mt-2 txt-apoio text-muted-foreground">
                Peça um novo link de cadastro à administração do seu condomínio.
              </p>
            </div>
          )}

          {etapa === 'form' && dados && (
            <form
              className="space-y-5"
              onSubmit={(ev) => {
                ev.preventDefault();
                irParaRevisao();
              }}
            >
              <p className="txt-apoio text-muted-foreground">
                Preencha os seus dados para receber os avisos de encomenda pelo WhatsApp.
              </p>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  autoComplete="name"
                  maxLength={200}
                />
                {erros.nome && <p className="txt-apoio text-destructive">{erros.nome}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">WhatsApp</Label>
                <PhoneInput
                  id="telefone"
                  value={form.telefoneE164}
                  onChange={(v) => setForm((f) => ({ ...f, telefoneE164: v }))}
                />
                {erros.telefoneE164 && (
                  <p className="txt-apoio text-destructive">{erros.telefoneE164}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidade">Sua unidade</Label>
                <SearchSelect
                  id="unidade"
                  value={form.apartamentoId}
                  onValueChange={(v) => setForm((f) => ({ ...f, apartamentoId: v }))}
                  options={opcoesUnidade}
                  placeholder="Escolha o bloco/apartamento"
                  searchPlaceholder={
                    dados.estruturaBlocos === 'multiplos'
                      ? 'Digite o bloco ou o número…'
                      : 'Digite o número da unidade…'
                  }
                />
                {erros.apartamentoId && (
                  <p className="txt-apoio text-destructive">{erros.apartamentoId}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="documento">
                  Documento <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="documento"
                  value={form.documento}
                  onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))}
                  maxLength={20}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  E-mail <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="email"
                />
              </div>

              <Button type="submit" className="w-full">
                Revisar cadastro
              </Button>
            </form>
          )}

          {etapa === 'revisao' && (
            <div className="space-y-5">
              <div>
                <h2 className="txt-secao">Confira seus dados</h2>
                <p className="mt-1 txt-apoio text-muted-foreground">
                  Verifique com atenção o <strong>bloco e a unidade</strong> antes de confirmar.
                </p>
              </div>

              <dl className="divide-y divide-border rounded-lg border border-border">
                <Linha rotulo="Nome" valor={form.nome.trim()} />
                <Linha rotulo="WhatsApp" valor={formatarTelefone(form.telefoneE164)} />
                <Linha rotulo="Unidade" valor={unidadeEscolhida?.identificador ?? '—'} destaque />
                {form.documento.trim() && <Linha rotulo="Documento" valor={form.documento.trim()} />}
                {form.email.trim() && <Linha rotulo="E-mail" valor={form.email.trim()} />}
              </dl>

              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <Button className="w-full" onClick={confirmar} disabled={enviando}>
                  {enviando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirmando…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar cadastro
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setEtapa('form')}
                  disabled={enviando}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar e corrigir
                </Button>
              </div>
            </div>
          )}

          {etapa === 'concluido' && (
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" />
              <h2 className="txt-secao">Cadastro realizado!</h2>
              <p className="mt-2 txt-apoio text-muted-foreground">
                Pronto. Você passará a receber os avisos de encomenda no WhatsApp informado.
              </p>
              <Button variant="outline" className="mt-6 w-full" onClick={recomecar}>
                <UserPlus className="mr-2 h-4 w-4" /> Cadastrar outra pessoa
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center txt-nota text-muted-foreground">Chegou · notificação de encomendas</p>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="txt-apoio text-muted-foreground">{rotulo}</dt>
      <dd className={destaque ? 'txt-subtitulo font-semibold text-primary' : 'txt-corpo text-right'}>
        {valor}
      </dd>
    </div>
  );
}
