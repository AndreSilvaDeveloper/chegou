import { EquipeManager } from '../components/EquipeManager';

export function Equipe() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Equipe</h1>
      <p className="text-sm text-slate-500">Crie e gerencie os acessos de porteiros e síndicos deste condomínio.</p>
      <EquipeManager basePath="" allowedRoles={['porteiro', 'sindico']} />
    </div>
  );
}
