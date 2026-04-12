# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sublink Worker is a proxy subscription converter built on **Hono** (web framework) targeting **Cloudflare Workers** as the primary runtime. It parses proxy protocol URIs (SS, VMess, VLESS, Hysteria2, Trojan, TUIC) and subscription feeds, then converts them into configuration files for various proxy clients (Sing-Box, Clash, Surge, Xray/V2Ray).

Also deployable on Vercel, Node.js standalone, and Docker.

## Commands

- `npm run dev` — local dev server via wrangler
- `npm test` — run all tests (vitest with `@cloudflare/vitest-pool-workers`)
- `npx vitest test/clash-builder.test.js` — run a single test file
- `npm run deploy` — deploy to Cloudflare Workers (sets up KV + wrangler deploy)
- `npm run build` — build for Vercel
- `npm run build:node && node dist/node-server.cjs` — build and run Node.js server

No linter or formatter is configured for this project.

## Architecture

### Request Flow

1. **Entry point**: `src/worker.jsx` — Cloudflare Workers fetch handler
2. **Runtime adapter**: `src/runtime/` — normalizes platform differences (Cloudflare, Node, Vercel) into a unified runtime object with KV, logger, config, and asset fetcher
3. **App factory**: `src/app/createApp.jsx` — creates Hono app with all routes and middleware

### Runtime Adapter Interface

All platform adapters (`src/runtime/`) expose a consistent `RuntimeBindings` object:
- `kv` — KeyValueStore with `get`, `put`, `delete` methods
- `assetFetcher` — `(request) => Promise<Response>` for serving static files
- `logger` — Console-like logging object
- `config` — `{ configTtlSeconds, shortLinkTtlSeconds }`

### Core Pipeline: Subscription Input → Client Config Output

**Parsers** (`src/parsers/`):
- `ProxyParser.js` dispatches to protocol-specific parsers in `src/parsers/protocols/` (vmess, vless, ss, trojan, hysteria2, tuic)
- `subscription/` handles fetching HTTP subscriptions and detecting input format (URI list, base64, Clash YAML, Sing-Box JSON, Surge INI)
- `convertYamlProxyToObject.js` / `convertSurgeProxyToObject.js` — convert non-URI format proxies to the normalized proxy object

**Subscription format detection** (`src/parsers/subscription/subscriptionContentParser.js`) uses a waterfall:
1. Try Sing-Box JSON (valid JSON with `outbounds` array)
2. Try Clash YAML (has `proxies` array)
3. Try Surge INI (has `[Proxy]`/`[General]`/`[Rule]` sections)
4. Fallback: split by newlines as raw URI list

**Builders** (`src/builders/`):
- `BaseConfigBuilder.js` — shared logic: fetch subscriptions, parse proxies, group by country, build proxy groups (selector/url-test)
- `SingboxConfigBuilder.js` — JSON output; supports v1.11 (legacy) and v1.12 (with `outbound_providers`)
- `ClashConfigBuilder.js` — YAML output via `js-yaml`
- `SurgeConfigBuilder.js` — INI-style text output

**Rules** (`src/config/`):
- `rules.js` — `UNIFIED_RULES` array (each with `name`, `site_rules`, `ip_rules`), plus `PREDEFINED_RULE_SETS` (`minimal`, `balanced`, `comprehensive`)
- `ruleGenerators.js` — generates format-specific rules (Sing-Box `.srs` rule sets vs Clash `.mrs` rule-providers vs Surge RULE-SET)
- Base config templates: `singboxConfig.js`, `clashConfig.js`, `surgeConfig.js`

### Normalized Proxy Object

All protocol parsers produce a common object shape consumed by builders:

```
{
  tag,                    // display name (from URI fragment)
  type,                   // protocol: "shadowsocks", "vmess", "vless", "trojan", "hysteria2", "tuic"
  server, server_port,
  uuid / password,        // auth credential (varies by protocol)
  tls: { enabled, server_name, insecure, reality?: { enabled, public_key, short_id } },
  transport: { type, path?, headers?, service_name? }  // ws, grpc, http, h2
}
```

Shared helpers in `src/utils.js`: `createTlsConfig()`, `createTransportConfig()`, `parseUrlParams()`, `parseServerInfo()`.

### Routes (defined in createApp.jsx)

| Route | Output |
|-------|--------|
| `/singbox` | Sing-Box JSON config |
| `/clash` | Clash YAML config |
| `/surge` | Surge INI config |
| `/xray` | Base64-encoded proxy list |
| `/subconverter` | Subconverter INI format |
| `/shorten-v2` | Create short URL (requires KV) |
| `/s/:code`, `/b/:code`, `/c/:code`, `/x/:code` | Short URL redirects |
| `/config` (POST) | Save base config to storage |
| `/resolve` | Resolve short URL to original |

All config endpoints accept `config` (required), `selectedRules`, `customRules`, `ua`, `group_by_country`, `include_auto_select`, `configId`, and format-specific params.

### Middleware & Error Handling

- Global middleware detects language from `lang` query param or `Accept-Language` header and injects a translator via Hono context
- Centralized error handler distinguishes `ServiceError` (from `src/services/errors.js`) with specific HTTP statuses from unhandled errors (500)
- Error hierarchy: `ServiceError` (base, 500) → `InvalidPayloadError` (400), `MissingDependencyError` (501)

### KV Storage Adapters (`src/adapters/kv/`)

Pluggable KV interface for short links and config storage: `cloudflareKv.js` (production), `redisKv.js`, `upstashKv.js`, `memoryKv.js` (dev).

### Frontend

Server-rendered JSX via Hono (`src/components/`). i18n support in `src/i18n/`. Static assets in `public/`.

## Key Technical Details

- **Pure JavaScript** with JSX (Hono JSX runtime) — no TypeScript
- **ES Modules** (`"type": "module"` in package.json)
- **JSX pragma**: files using JSX need `/** @jsxRuntime automatic */` and `/** @jsxImportSource hono/jsx */` at the top (no tsconfig/jsconfig — pragma comments are the only JSX configuration)
- Sing-Box version auto-detection: parses `singbox_version` query param or `User-Agent` header to pick v1.11 vs v1.12 config format
- Tests run in Cloudflare Workers environment via `@cloudflare/vitest-pool-workers` — the test pool uses `wrangler.toml` config
- KV namespace binding: `SUBLINK_KV`
- Comments in source are primarily in Chinese
- Many test files follow `issue-[number]-*.test.js` naming for regression tests tied to specific bug reports
