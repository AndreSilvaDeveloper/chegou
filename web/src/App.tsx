import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Apartamentos } from './pages/Apartamentos';
import { Dashboard } from './pages/Dashboard';
import { DetalheEncomenda } from './pages/DetalheEncomenda';
import { Login } from './pages/Login';
import { Moradores } from './pages/Moradores';
import { NovaEncomenda } from './pages/NovaEncomenda';
import { SuperAdmin } from './pages/SuperAdmin';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/encomendas/nova" element={<NovaEncomenda />} />
        <Route path="/encomendas/:id" element={<DetalheEncomenda />} />
        <Route path="/apartamentos" element={<Apartamentos />} />
        <Route path="/moradores" element={<Moradores />} />
        <Route path="/admin" element={<SuperAdmin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
