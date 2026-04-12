# AGENTS.md

This file gives Codex guidance for working in this repository.

## Project Overview

Sublink Worker is a proxy subscription converter and manager built with Hono. It primarily targets Cloudflare Workers, with additional Vercel, Node.js, and Docker runtimes.

The app parses proxy protocol URIs and subscriptions, then emits configs for Sing-Box, Clash, Surge, Xray/V2Ray, and subconverter-compatible clients.

Supported proxy protocols include Shadowsocks, VMess, VLESS, Hysteria2, Trojan, and TUIC.

## Commands

- `npm run dev` or `npm start`: run the local Cloudflare Worker dev server with Wrangler.
- `npm test`: run the Vitest suite.
- `npx vitest test/clash-builder.test.js`: run one test file.
- `npm run build`: build for Vercel via `scripts/build-vercel.mjs`.
- `npm run build:node`: bundle the standalone Node.js server into `dist/node-server.cjs`.
- `npm run dev:node`: build and run the Node.js server.
- `npm run deploy`: set up KV and deploy with Wrangler.

No linter or formatter is configured.

## Runtime And Entry Points

- `src/worker.jsx`: Cloudflare Workers fetch entry point.
- `src/app/createApp.jsx`: Hono app factory, routes, middleware, and error handling.
- `src/runtime/`: runtime adapters for Cloudflare, Node, Vercel, and shared runtime config.
- `src/platforms/`: platform-specific Node server entry points.
- `api/index.js`: Vercel entry point.

Runtime adapters expose a common binding shape:

```js
{
  kv,
  assetFetcher,
  logger,
  config
}
```

`kv` implements `get`, `put`, and `delete`.

## Core Pipeline

Subscription parsing lives under `src/parsers/`.

- `src/parsers/ProxyParser.js`: dispatches protocol URI parsing.
- `src/parsers/protocols/`: protocol-specific parsers.
- `src/parsers/subscription/`: HTTP fetching and subscription content detection.
- `src/parsers/convertYamlProxyToObject.js`: Clash YAML proxy conversion.
- `src/parsers/convertSurgeProxyToObject.js`: Surge proxy conversion.

Config builders live under `src/builders/`.

- `BaseConfigBuilder.js`: shared subscription fetch, proxy parse, country grouping, and proxy group logic.
- `SingboxConfigBuilder.js`: Sing-Box JSON output.
- `ClashConfigBuilder.js`: Clash YAML output.
- `SurgeConfigBuilder.js`: Surge INI output.

Rules and base templates live under `src/config/`.

## Routes

Main routes are defined in `src/app/createApp.jsx`.

- `/singbox`: Sing-Box JSON config.
- `/clash`: Clash YAML config.
- `/surge`: Surge INI config.
- `/xray`: base64-encoded proxy list.
- `/subconverter`: subconverter INI format.
- `/shorten-v2`: create short URLs, requires KV.
- `/s/:code`, `/b/:code`, `/c/:code`, `/x/:code`: short URL redirects.
- `/config`: POST endpoint for saving base config.
- `/resolve`: resolve a short URL to its original URL.

Config endpoints commonly accept `config`, `selectedRules`, `customRules`, `ua`, `group_by_country`, `include_auto_select`, `configId`, and format-specific query parameters.

## Frontend

Frontend rendering uses Hono JSX in `src/components/`.

Files containing JSX should include:

```js
/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
```

There is no TypeScript, tsconfig, or jsconfig. The project is pure JavaScript with ES modules.

Internationalization lives in `src/i18n/`.

## Storage

KV adapters live under `src/adapters/kv/`.

- `cloudflareKv.js`: Cloudflare Workers KV.
- `redisKv.js`: Redis.
- `upstashKv.js`: Upstash Redis-compatible REST KV.
- `memoryKv.js`: local/dev in-memory adapter.

The Cloudflare KV binding name is `SUBLINK_KV`.

## Testing Notes

Tests live in `test/` and run with Vitest. The suite uses `@cloudflare/vitest-pool-workers` and `wrangler.toml`.

Many regression tests are named like `issue-[number]-*.test.js`.

When changing parser or builder behavior, add or update focused tests for the affected protocol, format, or regression.

## Code Style Notes

- Preserve the existing JavaScript ES module style.
- Prefer existing helpers from `src/utils.js`, `src/builders/helpers/`, and adjacent modules before adding new abstractions.
- Keep changes scoped; avoid unrelated refactors.
- Source comments are often Chinese. Follow local style when adding comments, and only add comments for non-obvious behavior.
- Do not overwrite existing worktree changes unless explicitly asked.

