import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AdministradoraComResumo, AdministradoraDetalhe, Tenant } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DocumentoInput } from '@/components/ui/documento-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SimpleSelect } from '@/components/ui/simple-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Briefcase, Building2, Link2, Loader2, Plus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';

export function SuperAdminAdministradoras() {
  const [novaAberta, setNovaAberta] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const queryClient = useQueryClient();

  const listaQuery = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => api.get<AdministradoraComResumo[]>('/admin/administradoras'),
  });

  const criar = useMutation({
    mutationFn: () =>
      api.post<AdministradoraComResumo>('/admin/administradoras', {
        nome: nome.trim(),
        // O campo já entrega só dígitos; vazio some do corpo em vez de virar
        // string vazia, que o validador de documento reprovaria.
        documento: documento || undefined,
      }),
    onSuccess: () => {
      toast.success('Administradora cadastrada.');
      queryClient.invalidateQueries({ queryKey: ['administradoras'] });
      setNovaAberta(false);
      setNome('');
      setDocumento('');
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível cadastrar'));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Informe o nome da administradora');
    criar.mutate();
  };

  const lista = listaQuery.data ?? [];

  return (
    <PageShell
      icon={Briefcase}
      eyebrow="Plataforma"
      title="Administradoras"
      description="Empresas que administram carteiras de condomínios."
      acoes={
        <>
          <Button onClick={() => setNovaAberta(true)} className="flex-1 rounded-full sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Nova administradora
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      {listaQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[160px] rounded-xl" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Nenhuma administradora cadastrada"
          description="Cadastre a empresa e depois vincule os condomínios que ela administra."
          actionLabel="Cadastrar administradora"
          onAction={() => setNovaAberta(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((adm) => (
            <Card key={adm.id}>
              <CardContent className="space-y-4 p-4 md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="txt-subtitulo font-semibold text-foreground">{adm.nome}</p>
                  <Badge variant={adm.ativo ? 'success' : 'secondary'}>
                    {adm.ativo ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-3 txt-corpo">
                  <div>
                    <dt className="text-muted-foreground">Condomínios</dt>
                    <dd className="font-mono txt-corpo text-foreground">{adm.qtdCondominios}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Acessos</dt>
                    <dd className="font-mono txt-corpo text-foreground">{adm.qtdUsuarios}</dd>
                  </div>
                </dl>

                <Button
                  variant="outline"
                  onClick={() => setDetalheId(adm.id)}
                  className="w-full"
                >
                  <Users className="mr-2 h-4 w-4" />
                  Gerenciar carteira
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova administradora</DialogTitle>
            <DialogDescription>
              Depois de criada, vincule condomínios e crie os acessos dela.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adm-nome">
                Nome
              </Label>
              <Input
                id="adm-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adm-documento">CPF ou CNPJ</Label>
              <DocumentoInput
                id="adm-documento"
                value={documento}
                onChange={setDocumento}
              />
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNovaAberta(false)}
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
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CarteiraDialog administradoraId={detalheId} onClose={() => setDetalheId(null)} />
      </div>
    </PageShell>
  );
}

/** Carteira + acessos de uma administradora. */
function CarteiraDialog({
  administradoraId,
  onClose,
}: {
  administradoraId: string | null;
  onClose: () => void;
}) {
  const [vinculando, setVinculando] = useState('');
  const [usuario, setUsuario] = useState({ nome: '', email: '', senha: '' });
  const queryClient = useQueryClient();

  const detalheQuery = useQuery({
    queryKey: ['administradoras', administradoraId],
    queryFn: () => api.get<AdministradoraDetalhe>(`/admin/administradoras/${administradoraId}`),
    enabled: !!administradoraId,
  });

  const semCarteiraQuery = useQuery({
    queryKey: ['administradoras', 'sem-carteira'],
    queryFn: () => api.get<Tenant[]>('/admin/administradoras/condominios-sem-carteira'),
    enabled: !!administradoraId,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['administradoras'] });
  };

  const erro = (padrao: string) => (err: unknown) =>
    toast.error(mensagemErro(err, padrao));

  const vincular = useMutation({
    mutationFn: () =>
      api.post<Tenant>(`/admin/administradoras/${administradoraId}/condominios/vincular`, {
        tenantId: vinculando,
      }),
    onSuccess: () => {
      toast.success('Condomínio vinculado à carteira.');
      setVinculando('');
      invalidar();
    },
    onError: erro('Não foi possível vincular'),
  });

  const desvincular = useMutation({
    mutationFn: (tenantId: string) =>
      api.delete<Tenant>(`/admin/administradoras/${administradoraId}/condominios/${tenantId}`),
    onSuccess: () => {
      toast.success('Condomínio removido da carteira.');
      invalidar();
    },
    onError: erro('Não foi possível desvincular'),
  });

  const criarAcesso = useMutation({
    mutationFn: () =>
      api.post(`/admin/administradoras/${administradoraId}/usuarios`, {
        nome: usuario.nome.trim(),
        email: usuario.email.trim(),
        senha: usuario.senha,
      }),
    onSuccess: () => {
      toast.success('Acesso da administradora criado.');
      setUsuario({ nome: '', email: '', senha: '' });
      invalidar();
    },
    onError: erro('Não foi possível criar o acesso'),
  });

  const detalhe = detalheQuery.data;

  return (
    <Dialog open={!!administradoraId} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{detalhe?.nome ?? 'Carteira'}</DialogTitle>
          <DialogDescription>
            Condomínios administrados e acessos da empresa.
          </DialogDescription>
        </DialogHeader>

        {detalheQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* ---------------- condomínios ---------------- */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 txt-subtitulo font-semibold text-foreground">
                <Building2 className="h-4 w-4" />
                Condomínios ({detalhe?.condominios.length ?? 0})
              </h3>

              {detalhe?.condominios.length === 0 ? (
                <p className="txt-apoio text-muted-foreground">
                  Nenhum condomínio nesta carteira ainda.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detalhe?.condominios.map((tenant) => (
                    <li
                      key={tenant.id}
                      className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{tenant.nome}</p>
                        <p className="txt-apoio text-muted-foreground">{tenant.slug}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => desvincular.mutate(tenant.id)}
                        disabled={desvincular.isPending}
                        className="w-full sm:w-auto"
                      >
                        Remover da carteira
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 rounded-lg bg-muted/30 p-4">
                <Label htmlFor="vincular-cond">
                  Vincular condomínio existente
                </Label>
                <SimpleSelect
                  id="vincular-cond"
                  value={vinculando}
                  onValueChange={setVinculando}
                  placeholder="Condomínios ainda sem administradora"
                  options={(semCarteiraQuery.data ?? []).map((t) => ({
                    value: t.id,
                    label: t.nome,
                    hint: t.slug,
                  }))}
                />
                <Button
                  onClick={() => vincular.mutate()}
                  disabled={!vinculando || vincular.isPending}
                  className="w-full sm:w-auto"
                >
                  {vincular.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Vincular
                </Button>
              </div>
            </section>

            {/* ---------------- acessos ---------------- */}
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 txt-subtitulo font-semibold text-foreground">
                <Users className="h-4 w-4" />
                Acessos ({detalhe?.usuarios.length ?? 0})
              </h3>

              {detalhe?.usuarios.length === 0 ? (
                <p className="txt-apoio text-muted-foreground">
                  Nenhum acesso criado — sem isso a administradora não consegue entrar.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detalhe?.usuarios.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{u.nome}</p>
                        <p className="break-all txt-apoio text-muted-foreground">{u.email}</p>
                      </div>
                      <Badge variant={u.ativo ? 'success' : 'secondary'}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                <p className="txt-corpo font-medium text-foreground">Novo acesso</p>
                <div className="space-y-2">
                  <Label htmlFor="acesso-nome">
                    Nome
                  </Label>
                  <Input
                    id="acesso-nome"
                    value={usuario.nome}
                    onChange={(e) => setUsuario({ ...usuario, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acesso-email">
                    E-mail
                  </Label>
                  <Input
                    id="acesso-email"
                    type="email"
                    value={usuario.email}
                    onChange={(e) => setUsuario({ ...usuario, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acesso-senha">
                    Senha provisória
                  </Label>
                  <Input
                    id="acesso-senha"
                    type="password"
                    value={usuario.senha}
                    onChange={(e) => setUsuario({ ...usuario, senha: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <Button
                  onClick={() => criarAcesso.mutate()}
                  disabled={
                    criarAcesso.isPending ||
                    !usuario.nome.trim() ||
                    !usuario.email.trim() ||
                    usuario.senha.length < 6
                  }
                  className="w-full sm:w-auto"
                >
                  {criarAcesso.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Criar acesso
                </Button>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
