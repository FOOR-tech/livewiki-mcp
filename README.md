# LiveWiki MCP desktop bridge

Connect an MCP desktop client to the consolidated LiveWiki service over stdio. The bridge forwards the hosted service's tool schemas and calls, so permissions, document revisions, topic filters and proposal workflows stay consistent with the web application.

This branch contains the **2.0 bridge implementation**. It has not been published to npm. The existing 1.x npm release uses the earlier read-only REST tools.

## Run from this checkout

Requires Node.js 20 or newer and a LiveWiki server with `/mcp/:tenant` enabled.

```bash
npm ci
npm run build
LIVEWIKI_API_URL=https://your-livewiki-host.example \
LIVEWIKI_TENANT=your-workspace \
LIVEWIKI_API_TOKEN=your-scoped-token \
node dist/cli.js
```

Configure a desktop client's stdio command as `node` with an absolute path to `dist/cli.js`. Supply `LIVEWIKI_API_URL`, `LIVEWIKI_TENANT` and `LIVEWIKI_API_TOKEN` through that client's environment configuration. The API URL is the service root, without `/api/v1` or `/mcp`. HTTPS is required except for local development on localhost, 127.0.0.1 or ::1.

Create a credential with explicit spaces and operations in LiveWiki. Read credentials expose read/search/Ask; upload credentials expose document-drop tools; writing, review and publishing require their corresponding explicit grants. Revocation and permission changes are checked by the hosted service on every call. The bridge does not infer rights from local settings.

Clients that support hosted Streamable HTTP and OAuth can connect directly to `https://your-livewiki-host.example/mcp/your-workspace` instead. This stdio bridge accepts a configured token; it does not store OAuth refresh credentials or launch a browser authorization flow.

## Tool and scope changes from 1.x

The current hosted tool contract is discovered at runtime. Old cached 1.x schemas must be refreshed. `livewiki_search` accepts `keyword`, `semantic` or `hybrid` mode. The legacy `topics` field contains **space slugs**; `topic_ids` contains knowledge-topic UUIDs discoverable through `livewiki_topics`. An explicit empty list returns no evidence. The server always intersects requested filters with the credential's actual grant.

`livewiki_read` reads a published document. Draft creation, proposal Apply, revision approval and publication are separate operations and tools. Writes require an idempotency key and exact revision/hash fields where specified. A retry must use the original key and payload. Hosted error results remain errors; the bridge never converts an uncertain mutation into success or retries a tool call on its own.

The current server schema, rather than this README, is the authority for available tools and argument validation. A missing tool means the credential does not expose that operation or the server version does not provide it.

## Validation

```bash
npm test
```

Tests cover URL/credential boundaries, refusal to follow redirects, and an actual SDK stdio client connected through the bridge to a local HTTP MCP fixture. They verify current tool discovery, exact arguments, empty topic scopes and permission revocation. These tests do not certify every third-party desktop client or publish an npm package.
