import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, AuthenticatedUser, getToken, setToken, setUser } from '../api/client';
import { motion } from 'motion/react';
import { Package, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="flex min-h-screen w-full bg-background md:grid md:grid-cols-2">
      {/* Esquerda: Ilustração/Branding */}
      <div className="relative hidden flex-col bg-muted p-10 text-white dark:border-r md:flex">
        <div className="absolute inset-0 bg-primary" />
        <div className="relative z-20 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Package className="h-8 w-8" />
          Chegou
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg font-medium leading-relaxed">
              &ldquo;Gestão inteligente de condomínios com notificação direta no WhatsApp dos moradores. O jeito moderno de organizar sua portaria.&rdquo;
            </p>
          </blockquote>
        </div>
      </div>

      {/* Direita: Formulário */}
      <div className="flex w-full items-center justify-center p-6 sm:p-12 md:p-16 lg:p-24">
        <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center space-y-8">
          <div className="flex flex-col space-y-2 text-center md:text-left">
            <div className="mb-4 flex justify-center md:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                <Package className="h-7 w-7" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Bem-vindo</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Acesse sua conta para gerenciar as encomendas do condomínio.
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
              <motion.div variants={itemVariants} className="rounded-lg bg-destructive/15 p-4 text-sm font-medium text-destructive">
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
                  className="pl-10"
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
                  className="px-10"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="pt-2">
              <Button type="submit" size="xl" className="w-full text-base font-semibold" disabled={loading}>
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
