# SaltoPlay

- Use pnpm and pnpx exclusively.
- SaltoPlay was never released: no legacy data imports or compatibility migrations. Use pnpm db:generate for versioned schema changes in src/db/migrations and pnpm db:migrate to apply them manually to the dedicated database. Never apply schema changes automatically at startup or build time.
- Astro SSR, Tailwind CSS v4, TypeScript, PostgreSQL and Drizzle.
- Never access the main website database for this project.
- Hosted game code must remain isolated from the portal origin. Never send a SaltoUruguayServer token or portal session to an iframe.
- Do not create or run tests, or start/restart development servers, unless the user explicitly authorizes it again.
- Always use SaltoUruguayServer in user-facing copy, page titles, messages, accessibility labels and documentation. SUS is an internal abbreviation only (for example environment variables and database identifiers).
- Keep the public portal focused on players, games, their library, and community servers/series, inspired by Facebook Gameroom. Developer tools belong in the footer and their own contextual area, not homepage marketing or the main header.
- Community series states are editorial, not live server health. Never invent player counts or online status.
