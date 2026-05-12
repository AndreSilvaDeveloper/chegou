import { ApartamentosManager } from '../components/ApartamentosManager';

export function Apartamentos() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Apartamentos</h1>
      <ApartamentosManager basePath="" />
    </div>
  );
}
