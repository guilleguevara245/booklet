<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/booklet-logo-dark.svg">
    <img src="docs/brand/booklet-logo.svg" alt="Booklet" width="420">
  </picture>
</p>

<p align="center"><strong>Tu agenda, siempre al día.</strong></p>

<p align="center">
  <img src="https://github.com/guilleguevara245/booklet/actions/workflows/ci.yml/badge.svg" alt="CI">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6" alt="TypeScript 6">
  <img src="https://img.shields.io/badge/NestJS-12-E0234E" alt="NestJS 12">
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="React 19">
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="Licencia MIT">
</p>

# Booklet

**Turnos online para cualquier negocio.** El negocio carga sus servicios, horarios y profesionales; el cliente
reserva desde la web o la app y paga la seña con Mercado Pago. La agenda se actualiza en vivo y los recordatorios
salen solos.

> En construcción. Este README crece con cada fase.

## Stack

Monorepo TypeScript de punta a punta, con tipos y validaciones compartidos entre el servidor y los clientes.

| Parte                | Tecnología                                                |
| -------------------- | --------------------------------------------------------- |
| API                  | NestJS 12 sobre Fastify, Drizzle ORM, Zod                 |
| Base de datos        | PostgreSQL 16                                             |
| Colas y caché        | Redis 7 (BullMQ en la fase de recordatorios)              |
| Panel web y reservas | React 19, Vite, TanStack Query, Tailwind CSS              |
| App mobile           | Expo (React Native), en la fase 8                         |
| Monorepo             | pnpm workspaces + Turborepo                               |
| Calidad              | Vitest, Testing Library, ESLint, Prettier, GitHub Actions |

```
apps/api         API (NestJS)
apps/web         panel del negocio y página pública de reservas (React)
packages/shared  esquemas Zod y tipos compartidos
docs/brand       logo e ícono
```

## Hoja de ruta

- [x] **Fase 0 · Fundaciones:** monorepo, Docker Compose, CI, chequeo de salud de la API.
- [ ] **Fase 1 · Modelo y agenda:** negocios, sucursales, profesionales, servicios, horarios y feriados; cálculo
      de disponibilidad.
- [ ] **Fase 2 · Reservas sin choques:** restricción de exclusión de PostgreSQL (`EXCLUDE USING gist` sobre
      `tstzrange`) para que la base misma impida un turno doble.
- [ ] **Fase 3 · Cuentas y roles:** dueño, staff y cliente; Google o mail; invitaciones.
- [ ] **Fase 4 · Agenda en tiempo real:** WebSockets, una sala por negocio.
- [ ] **Fase 5 · Página pública de reservas:** `/n/mi-negocio`.
- [ ] **Fase 6 · Recordatorios:** BullMQ, mail 24 h y 1 h antes, cancelar o reprogramar con un link.
- [ ] **Fase 7 · Pagos:** seña con Mercado Pago, webhooks idempotentes, reembolsos.
- [ ] **Fase 8 · App mobile:** Expo con notificaciones push.
- [ ] **Fase 9 · Cierre:** estadísticas, accesibilidad, observabilidad, privacidad y dominio propio.

## Correr el proyecto

Requisitos: Node 22.12 o superior, pnpm 10 y Docker.

```bash
pnpm install
pnpm db:up                                # PostgreSQL y Redis
cp apps/api/.env.example apps/api/.env
pnpm dev                                  # API en :3000 y web en :5173
```

La web muestra el estado de la API, que consulta `GET /health`: responde 200 si la base de datos y Redis
contestan, y 503 con el detalle si alguno está caído.

| Comando                        | Qué hace                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | levanta todo en modo desarrollo                                                                 |
| `pnpm test`                    | corre las pruebas (las de integración necesitan `pnpm db:up` y las variables de `.env.example`) |
| `pnpm lint` / `pnpm typecheck` | revisa estilo y tipos                                                                           |
| `pnpm build`                   | compila todo                                                                                    |
| `pnpm format`                  | formatea con Prettier                                                                           |

## Licencia

[MIT](LICENSE)
