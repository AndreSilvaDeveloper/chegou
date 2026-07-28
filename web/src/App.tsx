import React, { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAtualizacaoAutomatica } from './hooks/use-atualizacao';

// Lazy loading all pages
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Encomendas = React.lazy(() => import('./pages/Encomendas').then(m => ({ default: m.Encomendas })));
const NovaEncomenda = React.lazy(() => import('./pages/NovaEncomenda').then(m => ({ default: m.NovaEncomenda })));
const DetalheEncomenda = React.lazy(() => import('./pages/DetalheEncomenda').then(m => ({ default: m.DetalheEncomenda })));
const Apartamentos = React.lazy(() => import('./pages/Apartamentos').then(m => ({ default: m.Apartamentos })));
const Moradores = React.lazy(() => import('./pages/Moradores').then(m => ({ default: m.Moradores })));
const Equipe = React.lazy(() => import('./pages/Equipe').then(m => ({ default: m.Equipe })));
const SuperAdmin = React.lazy(() => import('./pages/SuperAdmin').then(m => ({ default: m.SuperAdmin })));
const SuperAdminTenant = React.lazy(() => import('./pages/SuperAdminTenant').then(m => ({ default: m.SuperAdminTenant })));
const SuperAdminAdministradoras = React.lazy(() => import('./pages/SuperAdminAdministradoras').then(m => ({ default: m.SuperAdminAdministradoras })));
const MeusCondominios = React.lazy(() => import('./pages/MeusCondominios').then(m => ({ default: m.MeusCondominios })));
const MeuCondominio = React.lazy(() => import('./pages/MeuCondominio').then(m => ({ default: m.MeuCondominio })));
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const AutocadastroMorador = React.lazy(() => import('./pages/AutocadastroMorador').then(m => ({ default: m.AutocadastroMorador })));
const Relatorios = React.lazy(() => import('./pages/Relatorios').then(m => ({ default: m.Relatorios })));
const Vagas = React.lazy(() => import('./pages/Vagas').then(m => ({ default: m.Vagas })));
const Avisos = React.lazy(() => import('./pages/Avisos').then(m => ({ default: m.Avisos })));
const Notificacoes = React.lazy(() => import('./pages/Notificacoes').then(m => ({ default: m.Notificacoes })));
const Whatsapp = React.lazy(() => import('./pages/Whatsapp').then(m => ({ default: m.Whatsapp })));
const AdminWhatsapp = React.lazy(() => import('./pages/AdminWhatsapp').then(m => ({ default: m.AdminWhatsapp })));
const Assinatura = React.lazy(() => import('./pages/Assinatura').then(m => ({ default: m.Assinatura })));
const SuperAdminAssinaturas = React.lazy(() => import('./pages/SuperAdminAssinaturas').then(m => ({ default: m.SuperAdminAssinaturas })));

export default function App() {
  // Fica de olho em deploy novo e recarrega sozinho em momento seguro.
  // Aqui em cima porque vale também para a tela de login.
  useAtualizacaoAutomatica();

  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Carregando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Autocadastro de morador via QR: público, fora do Layout e sem login.
            O condomínio vem do token na URL, validado no servidor. */}
        <Route path="/cadastro/:token" element={<AutocadastroMorador />} />
        {/* O wrapper do Layout só exige login: a regra de "escolha um condomínio"
            fica em cada rota, senão a própria tela da carteira cairia nela. */}
        <Route element={<ProtectedRoute semCondominio><Layout /></ProtectedRoute>}>
          <Route path="/" element={<ProtectedRoute><Encomendas /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Dashboard /></ProtectedRoute>} />
          <Route path="/encomendas/nova" element={<ProtectedRoute><NovaEncomenda /></ProtectedRoute>} />
          <Route path="/encomendas/:id" element={<ProtectedRoute><DetalheEncomenda /></ProtectedRoute>} />
          <Route path="/apartamentos" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Apartamentos /></ProtectedRoute>} />
          <Route path="/moradores" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Moradores /></ProtectedRoute>} />
          <Route path="/equipe" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Equipe /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdmin /></ProtectedRoute>} />
          <Route path="/admin/whatsapp" element={<ProtectedRoute allowedRoles={['superadmin']}><AdminWhatsapp /></ProtectedRoute>} />
          <Route path="/admin/condominios/:id" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminTenant /></ProtectedRoute>} />
          <Route path="/admin/administradoras" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminAdministradoras /></ProtectedRoute>} />
          <Route path="/admin/assinaturas" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminAssinaturas /></ProtectedRoute>} />
          {/* A conta da administradora é a da carteira: `semCondominio` para ela
              poder abri-la sem ter escolhido um condomínio antes. */}
          <Route path="/assinatura" element={<ProtectedRoute allowedRoles={['admin', 'sindico']} semCondominio><Assinatura /></ProtectedRoute>} />
          {/* Carteira da administradora: única tela dela que roda sem condomínio escolhido. */}
          <Route path="/meus-condominios" element={<ProtectedRoute allowedRoles={['admin']} semCondominio><MeusCondominios /></ProtectedRoute>} />
          {/* `semCondominio` porque a própria tela entra no condomínio do :id —
              sem isso, abrir o link direto seria devolvido para a carteira. */}
          <Route path="/meus-condominios/:id" element={<ProtectedRoute allowedRoles={['admin']} semCondominio><MeuCondominio /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Relatorios /></ProtectedRoute>} />
          <Route path="/vagas" element={<ProtectedRoute allowedRoles={['admin', 'sindico']} requiresModule="vagas"><Vagas /></ProtectedRoute>} />
          <Route path="/avisos" element={<ProtectedRoute allowedRoles={['admin', 'sindico']} requiresModule="avisos"><Avisos /></ProtectedRoute>} />
          <Route path="/notificacoes" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Notificacoes /></ProtectedRoute>} />
          <Route path="/whatsapp" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Whatsapp /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
