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

### Full Docker (parity / Linux servers)

```bash
pnpm dev:docker                  # Postgres + Next, hot-reload, http://localhost:3000
```

> ⚠️ **On macOS**, the source bind-mount goes through VirtioFS, which makes the
> first compile of each route very slow (module resolution is I/O-bound). It's
> fine on Linux (native bind mounts). On a Mac, prefer the hybrid setup above
> for day-to-day development.

> Migrating an existing SQLite `dev.db`? Use `scripts/export-data.cjs`
> (run while still on SQLite) then `scripts/import-data.cjs` (after the
> Postgres migration). See the migration notes in the repo.

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

## 🧾 License

This project is licensed under the [MIT License](LICENSE).

---

Built with ❤️ using [Next.js](https://nextjs.org)
