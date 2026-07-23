import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, AuthenticatedUser, getToken, setToken, setUser } from '../api/client';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CodigoStrip } from '@/components/ui/codigo-strip';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const nav = useNavigate();

  if (getToken()) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ accessToken: string; user: AuthenticatedUser }>(
        '/auth/login',
        { email, senha },
      );
      setToken(res.accessToken);
      setUser(res.user);
      nav(res.user.role === 'superadmin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  };

  return (
    <div className="flex min-h-screen w-full bg-background md:grid md:grid-cols-[1.1fr_1fr]">
      {/* Esquerda: painel da central */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card p-10 md:flex lg:p-14">
        <div className="panel-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-primary/15 blur-3xl" aria-hidden />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary shadow-signal">
            <img src="/logo-mark.png" alt="Chegou" className="h-7 w-7" />
          </div>
          <div className="leading-none">
            <span className="text-xl font-extrabold tracking-tight text-foreground">chegou</span>
            <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">central de portaria</span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <p className="eyebrow">A encomenda chegou</p>
          <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-4xl">
            A portaria registra.<br />O morador recebe no WhatsApp.
          </h2>

          {/* Signature: o fluxo do código */}
          <div className="flex items-center gap-5">
            <CodigoStrip codigo="4821" size="lg" active />
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <MessageSquare className="h-5 w-5 text-emerald-500" />
              <span>Enviado ao morador<br />para retirada segura</span>
            </div>
          </div>
        </div>

        <p className="relative z-10 font-mono text-xs text-muted-foreground">
          Sem app para o morador — tudo onde ele já está.
        </p>
      </div>

      {/* Direita: formulário */}
      <div className="flex w-full items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center space-y-8">
          <div className="flex flex-col space-y-2 text-center md:text-left">
            <div className="mb-2 flex justify-center md:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-signal">
                <img src="/logo-mark.png" alt="Chegou" className="h-9 w-9" />
              </div>
            </div>
            <p className="eyebrow hidden md:block">Acesso restrito</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Entrar na central</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Acesse para gerenciar as encomendas do condomínio.
            </p>
          </div>

          <motion.form
            onSubmit={submit}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-5"
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm font-medium text-destructive"
              >
                {error}
              </motion.div>
            )}

            <motion.div variants={itemVariants} className="space-y-2">
              <Label htmlFor="email" className="text-base md:text-sm">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 pl-10"
                  required
                  autoFocus
                  disabled={loading}
                />
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-2">
              <Label htmlFor="password" className="text-base md:text-sm">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-12 px-10"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  disabled={loading}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="pt-2">
              <Button type="submit" size="lg" className="w-full text-base font-semibold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </motion.div>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
