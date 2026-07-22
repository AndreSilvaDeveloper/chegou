import React, { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';

// Lazy loading all pages
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const NovaEncomenda = React.lazy(() => import('./pages/NovaEncomenda').then(m => ({ default: m.NovaEncomenda })));
const DetalheEncomenda = React.lazy(() => import('./pages/DetalheEncomenda').then(m => ({ default: m.DetalheEncomenda })));
const Apartamentos = React.lazy(() => import('./pages/Apartamentos').then(m => ({ default: m.Apartamentos })));
const Moradores = React.lazy(() => import('./pages/Moradores').then(m => ({ default: m.Moradores })));
const Equipe = React.lazy(() => import('./pages/Equipe').then(m => ({ default: m.Equipe })));
const SuperAdmin = React.lazy(() => import('./pages/SuperAdmin').then(m => ({ default: m.SuperAdmin })));
const SuperAdminTenant = React.lazy(() => import('./pages/SuperAdminTenant').then(m => ({ default: m.SuperAdminTenant })));
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Relatorios = React.lazy(() => import('./pages/Relatorios').then(m => ({ default: m.Relatorios })));
const Vagas = React.lazy(() => import('./pages/Vagas').then(m => ({ default: m.Vagas })));
const Avisos = React.lazy(() => import('./pages/Avisos').then(m => ({ default: m.Avisos })));
const Notificacoes = React.lazy(() => import('./pages/Notificacoes').then(m => ({ default: m.Notificacoes })));

export default function App() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Carregando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/encomendas/nova" element={<NovaEncomenda />} />
          <Route path="/encomendas/:id" element={<DetalheEncomenda />} />
          <Route path="/apartamentos" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Apartamentos /></ProtectedRoute>} />
          <Route path="/moradores" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Moradores /></ProtectedRoute>} />
          <Route path="/equipe" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Equipe /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdmin /></ProtectedRoute>} />
          <Route path="/admin/condominios/:id" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminTenant /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Relatorios /></ProtectedRoute>} />
          <Route path="/vagas" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Vagas /></ProtectedRoute>} />
          <Route path="/avisos" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Avisos /></ProtectedRoute>} />
          <Route path="/notificacoes" element={<ProtectedRoute allowedRoles={['admin', 'sindico']}><Notificacoes /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
