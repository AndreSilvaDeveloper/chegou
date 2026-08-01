import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Administradora, Tenant } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building2, Loader2, LogIn, MapPin, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import { useAuthMe, useCondominioAtivo, useTrocarCondominio } from '@/hooks/use-tenant-config';

/** Slug sugerido a partir do nome — o síndico não precisa saber o que é slug. */
function sugerirSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

const FORM_VAZIO = {
  nome: '',
  slug: '',
  cidade: '',
  estado: '',
  sindicoNome: '',
  sindicoEmail: '',
  sindicoSenha: '',
};

export function MeusCondominios() {
  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trocarCondominio = useTrocarCondominio();
  const ativo = useCondominioAtivo();
  const { data: usuario } = useAuthMe();

  const administradoraQuery = useQuery({
    queryKey: ['minha-administradora'],
    queryFn: () => api.get<Administradora>('/minha-administradora'),
  });

  const condominiosQuery = useQuery({
    queryKey: ['minha-administradora', 'condominios'],
    queryFn: () => api.get<Tenant[]>('/minha-administradora/condominios'),
  });

  const criar = useMutation({
    mutationFn: (dados: typeof FORM_VAZIO) =>
      api.post<Tenant>('/minha-administradora/condominios', {
        nome: dados.nome.trim(),
        slug: dados.slug.trim() || sugerirSlug(dados.nome),
        cidade: dados.cidade.trim() || undefined,
        estado: dados.estado.trim().toUpperCase() || undefined,
        sindicoNome: dados.sindicoNome.trim(),
        sindicoEmail: dados.sindicoEmail.trim(),
        sindicoSenha: dados.sindicoSenha,
      }),
    onSuccess: () => {
      toast.success('Condomínio cadastrado na sua carteira.');
      queryClient.invalidateQueries({ queryKey: ['minha-administradora'] });
      setNovoAberto(false);
      setForm(FORM_VAZIO);
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível cadastrar'));
    },
  });

  const entrar = (tenant: Tenant) => {
    trocarCondominio(tenant.id);
    toast.success(`Você está em ${tenant.nome}.`);
    navigate('/dashboard');
  };

  /**
   * Configurar entra no condomínio antes de navegar.
   *
   * A tela de configuração usa as rotas normais do condomínio (`X-Tenant-Id`),
   * então o condomínio precisa já estar escolhido quando ela montar. Ela também
   * se vira sozinha se alguém abrir o link direto — aqui é só para não piscar.
   */
  const configurar = (tenant: Tenant) => {
    if (ativo.id !== tenant.id) trocarCondominio(tenant.id);
    navigate(`/meus-condominios/${tenant.id}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error('Informe o nome do condomínio');
    if (!form.sindicoNome.trim() || !form.sindicoEmail.trim()) {
      return toast.error('Informe o síndico responsável — ele é o primeiro acesso do condomínio');
    }
    if (form.sindicoSenha.length < 6) {
      return toast.error('A senha do síndico precisa ter ao menos 6 caracteres');
    }
    criar.mutate(form);
  };

  const condominios = condominiosQuery.data ?? [];

  return (
    <PageShell
      icon={Building2}
      eyebrow="Administradora"
      title={administradoraQuery.data?.nome ?? usuario?.administradoraNome ?? 'Meus condomínios'}
      description={`${condominios.length} condomínio(s) na sua carteira`}
      acoes={
        <>
          <Button onClick={() => setNovoAberto(true)} className="flex-1 rounded-full sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Novo condomínio
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      {condominiosQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      ) : condominios.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhum condomínio na carteira"
          description="Cadastre o primeiro condomínio que a sua administradora gerencia."
          actionLabel="Cadastrar condomínio"
          onAction={() => setNovoAberto(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {condominios.map((tenant) => {
            const estaAtivo = ativo.id === tenant.id;
            return (
              <Card key={tenant.id} className={estaAtivo ? 'border-primary' : undefined}>
                <CardContent className="space-y-4 p-4 md:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="txt-subtitulo font-semibold text-foreground">{tenant.nome}</p>
                      <p className="flex items-center gap-1 txt-apoio text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {tenant.cidade
                          ? `${tenant.cidade}${tenant.estado ? `/${tenant.estado}` : ''}`
                          : 'Sem cidade informada'}
                      </p>
                    </div>
                    {estaAtivo ? (
                      <Badge variant="success">Em uso</Badge>
                    ) : (
                      <Badge variant={tenant.ativo ? 'outline' : 'secondary'}>
                        {tenant.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant={estaAtivo ? 'outline' : 'default'}
                      onClick={() => entrar(tenant)}
                      disabled={!tenant.ativo}
                      className="w-full"
                    >
                      <LogIn className="mr-2 h-4 w-4" />
                      {estaAtivo ? 'Continuar neste condomínio' : 'Entrar no condomínio'}
                    </Button>
                    {/* Configurar também entra no condomínio — a tela opera
                        dentro dele. Fica disponível mesmo com o condomínio
                        inativo: é onde ela confere o cadastro e vê que a
                        reativação é com a plataforma. */}
                    <Button
                      variant="outline"
                      onClick={() => configurar(tenant)}
                      className="w-full"
                    >
                      <Settings2 className="mr-2 h-4 w-4" />
                      Configurar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo condomínio</DialogTitle>
            <DialogDescription>
              O condomínio entra na sua carteira e já nasce com o primeiro acesso de síndico.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cond-nome">
                Nome do condomínio
              </Label>
              <Input
                id="cond-nome"
                value={form.nome}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    nome: e.target.value,
                    // Só acompanha o nome enquanto o síndico não editar o slug.
                    slug: f.slug === sugerirSlug(f.nome) ? sugerirSlug(e.target.value) : f.slug,
                  }))
                }
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cond-slug">
                Identificador (usado no endereço do sistema)
              </Label>
              <Input
                id="cond-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder={sugerirSlug(form.nome) || 'residencial-bela-vista'}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cond-cidade">
                  Cidade
                </Label>
                <Input
                  id="cond-cidade"
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cond-uf">
                  Estado (UF)
                </Label>
                <Input
                  id="cond-uf"
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })}
                  maxLength={2}
                  placeholder="SP"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg bg-muted/30 p-4">
              <p className="txt-corpo font-medium text-foreground">Primeiro acesso (síndico)</p>
              <div className="space-y-2">
                <Label htmlFor="sind-nome">
                  Nome do síndico
                </Label>
                <Input
                  id="sind-nome"
                  value={form.sindicoNome}
                  onChange={(e) => setForm({ ...form, sindicoNome: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sind-email">
                  E-mail do síndico
                </Label>
                <Input
                  id="sind-email"
                  type="email"
                  value={form.sindicoEmail}
                  onChange={(e) => setForm({ ...form, sindicoEmail: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sind-senha">
                  Senha provisória
                </Label>
                <Input
                  id="sind-senha"
                  type="password"
                  value={form.sindicoSenha}
                  onChange={(e) => setForm({ ...form, sindicoSenha: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNovoAberto(false)}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={criar.isPending}
                className="w-full sm:w-auto"
              >
                {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cadastrar condomínio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </PageShell>
  );
}
