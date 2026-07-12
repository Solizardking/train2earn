# Domains

## Primary: `skills.x402.wtf`

Canonical Skill Hub hostname for catalog, publish, scanner, and on-chain ledger.

| Record | Value |
|--------|--------|
| Type | `CNAME` (or A/ALIAS per host) |
| Name | `skills` |
| Target | Vercel project for `Solizardking/skills` (or Render static site) |

After DNS:

1. Add domain in Vercel → Project → Settings → Domains → `skills.x402.wtf`
2. Keep redirect/alias for `skills.onchainai.fund` → `skills.x402.wtf` (optional 308)
3. Redeploy: `npm run build:catalog` writes `public/CNAME` as `skills.x402.wtf`

## Aliases

| Host | Role |
|------|------|
| `skills.x402.wtf` | **Primary** |
| `skills.onchainai.fund` | Legacy alias (same static output) |
| `cheshireterminal.ai/skills` | Cheshire UI proxying hub API |
| `cheshireterminal.ai/skills-store` | Curated store (repo `skills-store/`) |

## Env

```bash
# Skill Hub build
export SKILLHUB_SITE_URL=https://skills.x402.wtf

# Cheshire (Vercel / Fly)
export SKILLS_LIVE_BASE_URL=https://skills.x402.wtf
```

## Verify

```bash
curl -sI https://skills.x402.wtf | head
curl -sS https://skills.x402.wtf/api/skills.json | head -c 200
curl -sS https://skills.x402.wtf/api/submissions.json | head -c 200
curl -sS https://cheshireterminal.ai/api/skills | head -c 200
```
