# <img src="./public/favicon.ico" alt="Placarr logo" width="20" /> Placarr

[![Made with Next.js](https://img.shields.io/badge/Made%20with-Next.js-000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![PNPM](https://img.shields.io/badge/package%20manager-pnpm-F69220?logo=pnpm)](https://pnpm.io)
[![UI by shadcn](https://img.shields.io/badge/UI-shadcn%2Fui-8B5CF6?logo=storybook&logoColor=white)](https://ui.shadcn.com/)
[![License](https://img.shields.io/github/license/clementmoine/placarr)](LICENSE)

**Placarr** is a sleek, mobile-first Next.js app that keeps all your inventory in your pocket.

---

## ✨ Features

- 📱 Responsive UI built with [shadcn/ui](https://ui.shadcn.com)

---

## 🚀 Getting Started

The app uses **PostgreSQL**.

### Recommended (fast, especially on macOS): DB in Docker + Next on host

```bash
pnpm install
docker compose up -d db          # PostgreSQL on localhost:5432
pnpm prisma migrate deploy       # apply migrations
pnpm prisma db seed              # create admin/guest users (first run only)
pnpm dev                         # native compile (~1-2s)
```

`DATABASE_URL` defaults to `postgresql://placarr:placarr@localhost:5432/placarr`
(see `.env`). Open [http://localhost:3000](http://localhost:3000) to view the app.

### Configuration

Copy [`.env.example`](./.env.example) to `.env`. Only two variables are
mandatory — `DATABASE_URL` and `NEXTAUTH_SECRET`; everything else has a working
default and the file documents each one next to its value.

What you may actually want to change:

| Variable                            | Default                    | Why you would touch it                                                                                                                  |
| ----------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD` / `GUEST_PASSWORD` | `admin` / `guest-password` | **Change these before exposing an instance** — the seed creates both accounts.                                                          |
| `FLARESOLVERR_URL`                  | unset                      | Enables the Cloudflare-protected retailers. Without it they are skipped.                                                                |
| `WORKER_CONCURRENCY`                | `6`                        | Jobs the `pnpm worker` process runs at once. Automatically capped to 3 when FlareSolverr is configured — one browser, one serial queue. |
| `BACKGROUND_IO_CONCURRENCY`         | `4`                        | In-process work the Next server does itself (a separate pool from the worker).                                                          |
| `BACKGROUND_CPU_CONCURRENCY`        | `2`                        | Image localization (`sharp`). Raise only if the host has cores to spare.                                                                |
| `PRISMA_PG_POOL_MAX`                | `10`                       | Connections per process. Keep (processes × pool) under Postgres `max_connections`.                                                      |
| Provider API keys                   | unset                      | Each missing key simply disables that provider — `pnpm providers:health` lists them.                                                    |

Provider credentials are all optional and all free tiers. A provider without its
key reports as `blocked` and is skipped at runtime rather than failing a scan.

### Full Docker (parity / Linux servers)

```bash
pnpm dev:docker                  # Postgres + Next, hot-reload, http://localhost:3000
```

> ⚠️ **On macOS**, the source bind-mount goes through VirtioFS, which makes the
> first compile of each route very slow (module resolution is I/O-bound). It's
> fine on Linux (native bind mounts). On a Mac, prefer the hybrid setup above
> for day-to-day development.

---

## 📸 Screenshots

<p align="center">
  <img src="./public/screenshots/narrow/home.png" alt="Home screen" width="200" style="display:inline-block; margin-right:10px;" />
  <img src="./public/screenshots/narrow/modal.png" alt="Modal view" width="200" style="display:inline-block;" />
</p>

---

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)

---

## 📦 Deploy on Vercel

Deploy this project instantly with [Vercel](https://vercel.com/new?utm_source=create-next-app&utm_medium=readme):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

---

## License

Placarr is licensed under the [GNU General Public License v3.0 or later](LICENSE).
See [NOTICE](NOTICE) for third-party foil CSS attributions (notably
[simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)).

---

Built with ❤️ using [Next.js](https://nextjs.org)
