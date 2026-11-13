import { Button } from '../components/ui';
import { useLogout, useMe } from '../lib/auth';

/** Panel del negocio. En el próximo commit muestra la agenda. */
export function PanelPage() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <main className="mx-auto max-w-3xl p-6 font-sans text-ink dark:text-white">
      <h1 className="text-2xl font-bold">Hola, {me?.user.name}</h1>
      <Button variant="secondary" className="mt-4" onClick={() => logout.mutate()}>
        Salir
      </Button>
    </main>
  );
}
