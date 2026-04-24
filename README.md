# @foor.tech/livewiki-mcp

**[LiveWiki](https://livewiki.foor.tech/)** over **MCP** — turn your team's knowledge base into a pluggable tool for any MCP-capable AI client (Claude Code, OpenAI Codex, Cursor, Zed, GitHub Copilot, …).

One index, many clients. Your AI tools query the same authoritative wiki your team already edits.

> New to LiveWiki? Spin up a workspace at **https://livewiki.foor.tech/**, drop in a Confluence export, MediaWiki dump, or a folder of docs — then plug this MCP server into your editor and ask questions across everything.

---

## What it gives your AI

Five tools, all scoped to the tenant you configure:

| Tool | Purpose |
|---|---|
| `livewiki_search` | Semantic (default) or keyword search across pages. Returns ranked excerpts. |
| `livewiki_ask` | RAG Q&A with source citations — ideal when the user has a direct question. |
| `livewiki_list_wikis` | Discover the wikis available in the workspace. |
| `livewiki_list_pages` | List pages in a specific wiki. |
| `livewiki_get_page` | Read the full markdown body of a page. |

Retrieval runs server-side (Voyage embeddings + pgvector) so your client pays only for the tokens it consumes in its own prompt, not for re-embedding on every query.

---

## Install

Pick whichever style fits your workflow:

**Run on demand (recommended for editors)** — no install needed; each session fetches the latest:

```bash
npx -y @foor.tech/livewiki-mcp
```

**Global install** — put `livewiki-mcp` on your PATH:

```bash
npm install -g @foor.tech/livewiki-mcp
livewiki-mcp --base-url=https://livewiki-api.foor.tech --tenant=my-workspace --token=lw_…
```

**Per-project install** — pin an exact version:

```bash
npm install --save-dev @foor.tech/livewiki-mcp
npx livewiki-mcp
```

All editor snippets below use the `npx -y` form — it's stateless and works across machines without pre-installation.

---

## Configure

Three environment variables (or equivalent CLI flags):

| Variable | Flag | Example |
|---|---|---|
| `LIVEWIKI_API_URL` | `--base-url` | `https://livewiki-api.foor.tech` |
| `LIVEWIKI_TENANT` | `--tenant` | `my-workspace` |
| `LIVEWIKI_API_TOKEN` | `--token` | `lw_…` (Settings → API tokens) |

Generate a token in your [LiveWiki](https://livewiki.foor.tech/) workspace under **Settings → API tokens** (direct link: `https://livewiki.foor.tech/<your-tenant>/settings`). The token is shown **once** at creation — copy it immediately; only a short prefix is retained afterwards.

---

## Wire it into your editor

### Claude Code

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "livewiki": {
      "command": "npx",
      "args": ["-y", "@foor.tech/livewiki-mcp"],
      "env": {
        "LIVEWIKI_API_URL": "https://livewiki-api.foor.tech",
        "LIVEWIKI_TENANT": "my-workspace",
        "LIVEWIKI_API_TOKEN": "lw_…"
      }
    }
  }
}
```

Restart Claude Code or run `/mcp` to verify.

### OpenAI Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.livewiki]
command = "npx"
args = ["-y", "@foor.tech/livewiki-mcp"]
env = { LIVEWIKI_API_URL = "https://livewiki-api.foor.tech", LIVEWIKI_TENANT = "my-workspace", LIVEWIKI_API_TOKEN = "lw_…" }
```

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "livewiki": {
      "command": "npx",
      "args": ["-y", "@foor.tech/livewiki-mcp"],
      "env": {
        "LIVEWIKI_API_URL": "https://livewiki-api.foor.tech",
        "LIVEWIKI_TENANT": "my-workspace",
        "LIVEWIKI_API_TOKEN": "lw_…"
      }
    }
  }
}
```

### Zed

`~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "livewiki": {
      "command": {
        "path": "npx",
        "args": ["-y", "@foor.tech/livewiki-mcp"],
        "env": {
          "LIVEWIKI_API_URL": "https://livewiki-api.foor.tech",
          "LIVEWIKI_TENANT": "my-workspace",
          "LIVEWIKI_API_TOKEN": "lw_…"
        }
      }
    }
  }
}
```

### GitHub Copilot (VS Code 1.95+)

`.vscode/mcp.json` (project) or user settings:

```json
{
  "servers": {
    "livewiki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@foor.tech/livewiki-mcp"],
      "env": {
        "LIVEWIKI_API_URL": "https://livewiki-api.foor.tech",
        "LIVEWIKI_TENANT": "my-workspace",
        "LIVEWIKI_API_TOKEN": "lw_…"
      }
    }
  }
}
```

---

## Scope guidance for your model

Include a short prompt hint in your `CLAUDE.md` / `.cursorrules` / etc. so the model reaches for LiveWiki in the right situations:

> You have access to a LiveWiki workspace via `livewiki_*` tools.
> When the user asks a "how do we…", "where is the doc for…", "what did we decide about…" style question that may be answered by team docs, call `livewiki_ask` first. If that returns low-relevance sources, fall back to `livewiki_search` with `mode: "semantic"`.

---

## What LiveWiki is

[LiveWiki](https://livewiki.foor.tech/) is an AI-powered wiki platform — modern MediaWiki replacement with auto-organize, stale detection, RAG Q&A, cross-links, and migration tools (MediaWiki, Confluence XML/HTML/Cloud, drop-and-organize for arbitrary files). This package is the MCP surface that exposes its retrieval to external AI clients.

Learn more and create a workspace: **https://livewiki.foor.tech/**

---

## Development

```bash
git clone https://github.com/FOOR-tech/livewiki-mcp
cd livewiki-mcp
npm install
npm run build
LIVEWIKI_API_URL=… LIVEWIKI_TENANT=… LIVEWIKI_API_TOKEN=… node dist/cli.js
```

The server speaks MCP over stdio. For an interactive sanity check, point an MCP inspector at it.

---

## Links

- **LiveWiki**: https://livewiki.foor.tech/
- **Source**: https://github.com/FOOR-tech/livewiki-mcp
- **npm**: https://www.npmjs.com/package/@foor.tech/livewiki-mcp
- **MCP spec**: https://modelcontextprotocol.io/

---

## License

MIT © [foor.tech](https://livewiki.foor.tech/)
