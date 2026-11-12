import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './api';

const LABELS = { database: 'Base de datos', redis: 'Redis' } as const;

export function ApiStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: 15_000,
  });

  let summary: string;
  let tone: string;
  if (isPending) {
    summary = 'Consultando la API…';
    tone = 'bg-slate-400';
  } else if (isError) {
    summary = 'La API no responde';
    tone = 'bg-red-600';
  } else if (data.status === 'ok') {
    summary = 'API funcionando';
    tone = 'bg-emerald-600';
  } else {
    summary = 'API con problemas';
    tone = 'bg-amber-500';
  }

  return (
    <section
      aria-labelledby="api-status-title"
      className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-left dark:border-white/10 dark:bg-white/5"
    >
      <h2 id="api-status-title" className="text-sm font-medium text-muted dark:text-slate-300">
        Estado del sistema
      </h2>
      <p role="status" className="mt-2 flex items-center gap-2 text-lg font-bold">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${tone}`} />
        {summary}
      </p>
      {data && (
        <ul className="mt-3 space-y-1 text-sm text-muted dark:text-slate-300">
          {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => (
            <li key={key} className="flex justify-between">
              <span>{LABELS[key]}</span>
              <span>{data.checks[key] === 'up' ? 'Funciona' : 'Caído'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
