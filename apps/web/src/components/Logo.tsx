import logoDark from '../logo-dark.svg';
import logo from '../logo.svg';

/** Logo de Booklet, con la versión clara u oscura según el tema del sistema. */
export function Logo({ className = 'h-auto w-40' }: { className?: string }) {
  return (
    <picture>
      <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />
      <img src={logo} alt="Booklet" width={500} height={168} className={className} />
    </picture>
  );
}
