import { MoradoresManager } from '../components/MoradoresManager';

export function Moradores() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Moradores</h1>
      <MoradoresManager basePath="" />
    </div>
  );
}
