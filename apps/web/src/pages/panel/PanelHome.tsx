import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Button, Field, FormError } from '../../components/ui';
import { useMe } from '../../lib/auth';
import { useCreateBusiness } from '../../lib/business';
import { PanelLayout } from './PanelLayout';

/** Arma la dirección pública a partir del nombre: "Peluquería Ana" → "peluqueria-ana". */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Con un solo negocio, entra directo; con varios, deja elegir; sin ninguno, ofrece crearlo. */
export function PanelHome() {
  const { data: me } = useMe();
  const memberships = me?.memberships ?? [];
  if (memberships.length === 1) {
    return <Navigate to={`/panel/${memberships[0]!.businessId}`} replace />;
  }
  return (
    <PanelLayout>
      <main className="mx-auto flex max-w-xl flex-col gap-8 p-6">
        {memberships.length > 0 && (
          <section aria-labelledby="mis-negocios">
            <h1 id="mis-negocios" className="mb-4 text-2xl font-bold">
              Tus negocios
            </h1>
            <ul className="flex flex-col gap-2">
              {memberships.map((m) => (
                <li key={m.businessId}>
                  <Link
                    to={`/panel/${m.businessId}`}
                    className="flex min-h-11 items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-white/10 dark:bg-white/5"
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="text-sm text-muted dark:text-slate-300">
                      {m.role === 'owner' ? 'Dueño' : 'Equipo'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <CreateBusiness first={memberships.length === 0} />
      </main>
    </PanelLayout>
  );
}

function CreateBusiness({ first }: { first: boolean }) {
  const create = useCreateBusiness();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ name, slug: effectiveSlug }, { onSuccess: (b) => navigate(`/panel/${b.id}`) });
  }

  const general =
    create.error && create.error.issues.length === 0 ? create.error.message : undefined;
  return (
    <section
      aria-labelledby="crear-negocio"
      className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5"
    >
      <h2 id="crear-negocio" className="mb-1 text-xl font-bold">
        {first ? 'Creá tu negocio' : 'Crear otro negocio'}
      </h2>
      {first && (
        <p className="mb-4 text-sm text-muted dark:text-slate-300">
          Es el primer paso para recibir reservas.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError>{general}</FormError>
        <Field
          label="Nombre del negocio"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={create.error?.field('name')}
        />
        <Field
          label="Dirección"
          required
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          hint="Así te van a encontrar tus clientes. Solo minúsculas, números y guiones."
          error={create.error?.field('slug')}
        />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creando…' : 'Crear negocio'}
        </Button>
      </form>
    </section>
  );
}
