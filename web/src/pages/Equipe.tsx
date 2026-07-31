import { EquipeManager } from '../components/EquipeManager';

// Página magra: título, busca e ações vêm do `PageShell` dentro do manager.
export function Equipe() {
  return <EquipeManager basePath="" allowedRoles={['porteiro', 'sindico']} />;
}
