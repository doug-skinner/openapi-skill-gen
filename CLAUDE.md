Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Prefer `Bun.file` over `node:fs` readFile/writeFile
- Bun automatically loads .env, so don't use dotenv.
