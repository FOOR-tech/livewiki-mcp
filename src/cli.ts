#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── Config ─────────────────────────────────────────────────────────

interface Config {
  baseUrl: string;
  token: string;
  tenant: string;
}

function parseArgs(argv: string[]): Partial<Config> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = arg.match(/^--([a-zA-Z0-9-]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1].replace(/-/g, '');
    const value = m[2] ?? argv[++i];
    if (!value) continue;
    out[key] = value;
  }
  return {
    baseUrl: out.baseurl ?? out.baseUrl,
    token: out.token,
    tenant: out.tenant,
  };
}

function loadConfig(): Config {
  const cli = parseArgs(process.argv.slice(2));
  const baseUrl = cli.baseUrl ?? process.env.LIVEWIKI_API_URL;
  const token = cli.token ?? process.env.LIVEWIKI_API_TOKEN;
  const tenant = cli.tenant ?? process.env.LIVEWIKI_TENANT;

  if (!baseUrl || !token || !tenant) {
    console.error(
      [
        'livewiki-mcp: missing configuration.',
        'Required: LIVEWIKI_API_URL, LIVEWIKI_API_TOKEN, LIVEWIKI_TENANT',
        '(or --base-url, --token, --tenant)',
      ].join('\n'),
    );
    process.exit(2);
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), token, tenant };
}

// ── LiveWiki REST client ──────────────────────────────────────────

class LiveWikiClient {
  constructor(private cfg: Config) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LiveWiki ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as { data?: T } | T;
    if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
      return (json as { data: T }).data;
    }
    return json as T;
  }

  searchKeyword(q: string, wikiSlug?: string, limit = 10) {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    if (wikiSlug) qs.set('wikiSlug', wikiSlug);
    return this.call<
      Array<{
        id: string;
        title: string;
        slug: string;
        wikiId: string;
        headline: string;
        rank: number;
      }>
    >(`/api/v1/tenants/${this.cfg.tenant}/search?${qs}`);
  }

  searchSemantic(q: string, wikiSlug?: string, limit = 10) {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    if (wikiSlug) qs.set('wikiSlug', wikiSlug);
    return this.call<
      Array<{
        id: string;
        title: string;
        slug: string;
        wikiId: string;
        excerpt: string;
        sectionPath: string | null;
        relevance: number;
      }>
    >(`/api/v1/tenants/${this.cfg.tenant}/search/semantic?${qs}`);
  }

  ask(question: string, wikiSlug?: string) {
    return this.call<{
      answer: string;
      sources: Array<{
        pageId: string;
        pageTitle: string;
        sectionPath: string | null;
        relevance: number;
      }>;
    }>(`/api/v1/tenants/${this.cfg.tenant}/ai/ask`, {
      method: 'POST',
      body: JSON.stringify({ question, wikiSlug }),
    });
  }

  listWikis() {
    return this.call<Array<{ id: string; slug: string; name: string; description?: string }>>(
      `/api/v1/tenants/${this.cfg.tenant}/wikis`,
    );
  }

  listPages(wikiSlug: string) {
    return this.call<
      Array<{ id: string; slug: string; title: string; tags?: string[] }>
    >(`/api/v1/tenants/${this.cfg.tenant}/wikis/${wikiSlug}/pages`);
  }

  getPage(wikiSlug: string, pageSlug: string) {
    return this.call<{
      id: string;
      title: string;
      slug: string;
      content: string;
      tags: string[];
      updatedAt: string;
      lastEditedAt: string | null;
    }>(`/api/v1/tenants/${this.cfg.tenant}/wikis/${wikiSlug}/pages/${pageSlug}`);
  }
}

// ── Tool definitions ──────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: 'livewiki_search',
    description:
      'Search pages in the LiveWiki knowledge base. Default mode "semantic" finds pages by meaning (best for questions); "keyword" matches literal words with highlighted fragments. Returns top results ranked by relevance. Use this to discover which pages might answer a question before reading their full content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query.' },
        mode: {
          type: 'string',
          enum: ['semantic', 'keyword'],
          default: 'semantic',
          description:
            'semantic (vector similarity, default) or keyword (Postgres full-text with highlights).',
        },
        wiki_slug: {
          type: 'string',
          description: 'Optional — restrict to one wiki (e.g. "engineering-handbook").',
        },
        limit: { type: 'number', default: 10, minimum: 1, maximum: 50 },
      },
      required: ['query'],
    },
  },
  {
    name: 'livewiki_ask',
    description:
      'Ask a natural-language question and get an answer synthesized from the wiki with citations. Uses RAG: embeds the question, retrieves the most relevant chunks, and returns an answer citing the source pages. Prefer this over search when the user has a question you can answer directly.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to answer.' },
        wiki_slug: {
          type: 'string',
          description: 'Optional — scope the answer to one wiki.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'livewiki_list_wikis',
    description:
      'List the wikis available in this LiveWiki tenant. Use this to discover what knowledge bases exist before searching.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'livewiki_list_pages',
    description:
      'List all pages in a wiki. Returns titles and slugs — use with livewiki_get_page to read specific ones.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_slug: { type: 'string', description: 'The wiki to list pages from.' },
      },
      required: ['wiki_slug'],
    },
  },
  {
    name: 'livewiki_get_page',
    description:
      'Read the full markdown content of a specific wiki page. Use this after livewiki_search / livewiki_list_pages to fetch a page you want to quote or reference in detail.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki_slug: { type: 'string' },
        page_slug: { type: 'string' },
      },
      required: ['wiki_slug', 'page_slug'],
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const cfg = loadConfig();
  const client = new LiveWikiClient(cfg);

  const server = new Server(
    { name: 'livewiki-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const a = args as Record<string, unknown>;

    try {
      switch (name) {
        case 'livewiki_search': {
          const query = String(a.query ?? '');
          const mode = (a.mode === 'keyword' ? 'keyword' : 'semantic') as
            | 'keyword'
            | 'semantic';
          const wikiSlug = typeof a.wiki_slug === 'string' ? a.wiki_slug : undefined;
          const limit = typeof a.limit === 'number' ? a.limit : 10;
          const results =
            mode === 'semantic'
              ? await client.searchSemantic(query, wikiSlug, limit)
              : await client.searchKeyword(query, wikiSlug, limit);
          return {
            content: [
              {
                type: 'text',
                text: formatResults(mode, results),
              },
            ],
          };
        }

        case 'livewiki_ask': {
          const question = String(a.question ?? '');
          const wikiSlug = typeof a.wiki_slug === 'string' ? a.wiki_slug : undefined;
          const res = await client.ask(question, wikiSlug);
          const body = [
            res.answer,
            '',
            'Sources:',
            ...res.sources.map(
              (s, i) =>
                `  [${i + 1}] ${s.pageTitle}${s.sectionPath ? ' > ' + s.sectionPath : ''} (relevance ${(s.relevance * 100).toFixed(0)}%)`,
            ),
          ].join('\n');
          return { content: [{ type: 'text', text: body }] };
        }

        case 'livewiki_list_wikis': {
          const wikis = await client.listWikis();
          return {
            content: [
              {
                type: 'text',
                text: wikis
                  .map((w) => `- ${w.name} (slug: ${w.slug})${w.description ? ` — ${w.description}` : ''}`)
                  .join('\n') || '(no wikis)',
              },
            ],
          };
        }

        case 'livewiki_list_pages': {
          const wikiSlug = String(a.wiki_slug ?? '');
          const pages = await client.listPages(wikiSlug);
          return {
            content: [
              {
                type: 'text',
                text:
                  pages
                    .map((p) => `- ${p.title} (${p.slug})${p.tags?.length ? ' [' + p.tags.join(', ') + ']' : ''}`)
                    .join('\n') || '(no pages)',
              },
            ],
          };
        }

        case 'livewiki_get_page': {
          const wikiSlug = String(a.wiki_slug ?? '');
          const pageSlug = String(a.page_slug ?? '');
          const page = await client.getPage(wikiSlug, pageSlug);
          return {
            content: [
              {
                type: 'text',
                text: `# ${page.title}\n\n${page.content}`,
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: `LiveWiki error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP framing channel
  console.error(
    `livewiki-mcp: connected to ${cfg.baseUrl} as tenant "${cfg.tenant}"`,
  );
}

// ── Formatting helpers ────────────────────────────────────────────

function formatResults(
  mode: 'semantic' | 'keyword',
  results:
    | Awaited<ReturnType<LiveWikiClient['searchSemantic']>>
    | Awaited<ReturnType<LiveWikiClient['searchKeyword']>>,
): string {
  if (results.length === 0) return '(no results)';
  if (mode === 'semantic') {
    return (results as Awaited<ReturnType<LiveWikiClient['searchSemantic']>>)
      .map((r, i) => {
        const score = (r.relevance * 100).toFixed(0);
        const section = r.sectionPath ? ` > ${r.sectionPath}` : '';
        return `[${i + 1}] (${score}%) ${r.title}${section} (slug: ${r.slug})\n    ${r.excerpt.replace(/\s+/g, ' ').slice(0, 240)}`;
      })
      .join('\n\n');
  }
  return (results as Awaited<ReturnType<LiveWikiClient['searchKeyword']>>)
    .map((r, i) => {
      // strip <mark> wrappers for a clean text view
      const excerpt = r.headline.replace(/<\/?mark>/g, '**');
      return `[${i + 1}] (rank ${r.rank.toFixed(3)}) ${r.title} (slug: ${r.slug})\n    ${excerpt.replace(/\s+/g, ' ').slice(0, 260)}`;
    })
    .join('\n\n');
}

main().catch((err) => {
  console.error('livewiki-mcp fatal:', err);
  process.exit(1);
});
