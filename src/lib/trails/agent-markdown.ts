/**
 * Agent-facing representations of a trail.
 *
 * The `/trail/{id}` page is client-hydrated, so a programmatic caller (curl,
 * an LLM fetcher, an agent handed the bare share link) only sees the loading
 * shell. The middleware rewrites those non-browser navigations to the by-id
 * API, which uses the helpers here to answer in a shape the caller can use:
 * Markdown for a human-readable read, or a private-trail notice that points at
 * the CLI when the repo is gated.
 *
 * JSON stays the default for direct API hits so existing consumers (the CLI,
 * the page's own crawler-equivalent metadata fetch, anything sending
 * `Accept: *​/*`) are unaffected — Markdown is strictly opt-in.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { TrailMarker, TrailPayload } from './types';
import type { TopicPayload } from '@/lib/topics/types';

/**
 * The Principal CLI. Hitting a private trail anonymously is a dead end in a
 * browser tab; the CLI resolves the caller's GitHub token and calls the same
 * API with a Bearer token, so it returns any trail whose backing repo the
 * caller can read.
 */
export const CLI_PACKAGE = '@principal-ai/principal-view-cli';

/** How a non-browser caller wants a resource represented. */
export type AgentFormat = 'json' | 'md';

/** The subset of the agent envelope's `_links` that Markdown rendering needs. */
export interface TrailLinks {
  self: string;
  notes: string;
  signOffs: string;
  humanView: string;
}

/**
 * Decide JSON vs. Markdown for a programmatic caller. Defaults to JSON so
 * direct API consumers are untouched; Markdown is opt-in via `?format=md` or
 * an explicit `Accept: text/markdown` that doesn't also ask for JSON. The
 * `/trail/{id}` middleware sets `?format=md` when it rewrites a non-browser
 * navigation here.
 */
export function negotiateFormat(request: NextRequest): AgentFormat {
  // After a middleware rewrite that adds `?format=md`, the param is visible on
  // `nextUrl` (NextRequest), not on the raw `request.url` string. Prefer
  // nextUrl; fall back to parsing request.url for plain/mocked requests.
  const searchParams =
    (request as Partial<NextRequest>).nextUrl?.searchParams ??
    new URL(request.url).searchParams;
  const q = searchParams.get('format');
  if (q === 'md' || q === 'markdown') return 'md';
  if (q === 'json') return 'json';
  // Signal set by the `/trail/{id}` middleware when it rewrites a non-browser
  // navigation here (query params don't survive the rewrite; headers do).
  const hdr = request.headers.get('x-agent-format');
  if (hdr === 'md') return 'md';
  if (hdr === 'json') return 'json';
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('text/markdown') && !accept.includes('application/json')) {
    return 'md';
  }
  return 'json';
}

/**
 * Additive `cli`/`cliHint` fields merged into JSON error/`403` bodies so a
 * programmatic JSON caller (not just the Markdown reader) learns the
 * authenticated path without us changing any existing field.
 */
export function cliHint() {
  return {
    cli: `npx ${CLI_PACKAGE} trail view <id-or-url>`,
    cliHint:
      `Private trails are gated by GitHub repository read access. Run ` +
      `\`npx ${CLI_PACKAGE} trail view <id-or-url>\` — the CLI resolves your ` +
      `GitHub token (via the gh CLI or a git credential helper) and calls this ` +
      `same API with a Bearer token, so it returns the trail whenever your ` +
      `GitHub account can read the backing repository.`,
  };
}

/** Markdown shown to a non-browser caller for a private / no-access trail. */
export function privateTrailMarkdown(humanView: string): string {
  return [
    '# Private trail',
    '',
    'This trail is gated by GitHub repository read access, so it is not',
    'available to anonymous callers.',
    '',
    'To view it as yourself:',
    '',
    `- **CLI** — \`npx ${CLI_PACKAGE} trail view <id-or-url>\`. The CLI resolves`,
    '  your GitHub token (via the `gh` CLI or a git credential helper) and calls',
    '  this same API with a `Bearer` token, so it returns the trail whenever your',
    '  GitHub account can read the backing repository.',
    `- **Browser** — open ${humanView} while signed in to Principal.`,
    '',
  ].join('\n');
}

/** Markdown shown when no trail matches the id. */
export function notFoundMarkdown(): string {
  return ['# Trail not found', '', 'No trail matches this id.', ''].join('\n');
}

function markerLocation(m: TrailMarker): string {
  if (!m.sourcePath) return '_(no file)_';
  const s = m.snippet;
  if (s && typeof s.startLine === 'number' && typeof s.endLine === 'number') {
    const range =
      s.startLine === s.endLine
        ? `${s.startLine}`
        : `${s.startLine}–${s.endLine}`;
    return `\`${m.sourcePath}:${range}\``;
  }
  return `\`${m.sourcePath}\``;
}

function blockquote(s: string): string {
  return s
    .trim()
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');
}

function indent(s: string): string {
  return s
    .trim()
    .split('\n')
    .map((l) => `   ${l}`)
    .join('\n');
}

/** Render a public trail payload as human-readable Markdown. */
export function trailMarkdown(opts: {
  owner: string;
  repo: string;
  payload: TrailPayload;
  links: TrailLinks;
}): string {
  const { owner, repo, payload, links } = opts;
  const out: string[] = [];
  const ref = payload.authoredAt?.ref;
  const purpose = payload.purpose ?? 'investigation';
  const n = payload.markers.length;

  out.push(`# ${payload.title}`);
  out.push(
    `*${owner}/${repo}${ref ? `@${ref}` : ''} · ${purpose} · ${n} marker${
      n === 1 ? '' : 's'
    }*`,
  );

  if (payload.request) {
    out.push('', `**Request:** ${payload.request}`);
  }
  if (payload.summary) {
    out.push('', blockquote(payload.summary));
  }

  const credits: string[] = [];
  if (payload.author) credits.push(`**Author:** ${payload.author}`);
  if (payload.updatedAt) credits.push(`**Updated:** ${payload.updatedAt}`);
  if (credits.length) out.push('', credits.join(' · '));

  out.push('', '## Markers');
  payload.markers.forEach((m, i) => {
    const label = m.label ?? `Marker ${i + 1}`;
    const role = m.kind ? ` _(${m.kind})_` : '';
    out.push(`${i + 1}. **${label}** — ${markerLocation(m)}${role}`);
    if (m.description) out.push(indent(m.description));
  });

  out.push('', '---', `Interactive view: ${links.humanView}`, `JSON: ${links.self}`);
  if (payload.authoredAt?.sha) {
    out.push(
      `Authored at \`${payload.authoredAt.sha}\`${ref ? ` (${ref})` : ''}.`,
    );
  }
  out.push('');
  return out.join('\n');
}

/** `text/markdown` response with the given status. Shared by both routes. */
export function markdownResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}

// ============================================================================
// Topics. A topic is a curated bundle of trails (TopicPayload). Private topics
// are hidden behind a 404 (existence is not disclosed), so — unlike trails —
// there is no separate 403: the not-found and private cases share one notice.
// ============================================================================

/** The subset of the topic agent envelope's `_links` Markdown rendering needs. */
export interface TopicLinks {
  self: string;
  trails: string;
  comments: string;
  suggestions: string;
  humanView: string;
}

/** Additive `cli`/`cliHint` fields merged into a topic's JSON 404 body. */
export function topicCliHint() {
  return {
    cli: `npx ${CLI_PACKAGE} topic view <id-or-url>`,
    cliHint:
      `No topic matches this id, or it is private. Private topics are readable ` +
      `only by their creator and the people they were shared with. If a private ` +
      `topic was shared with you, run \`npx ${CLI_PACKAGE} topic view <id-or-url>\` ` +
      `— the CLI resolves your GitHub token (via the gh CLI or a git credential ` +
      `helper) and calls this same API with a Bearer token.`,
  };
}

/**
 * Markdown for a topic that doesn't resolve. Deliberately conflates "no such
 * topic" with "private and you can't read it" so the response never discloses
 * that a private topic exists at this id.
 */
export function topicNotFoundOrPrivateMarkdown(humanView: string): string {
  return [
    '# Topic not found',
    '',
    "No topic matches this id — or it's private. Private topics are readable",
    'only by their creator and the people they were shared with.',
    '',
    'If a private topic was shared with you, view it as yourself:',
    '',
    `- **CLI** — \`npx ${CLI_PACKAGE} topic view <id-or-url>\`. The CLI resolves`,
    '  your GitHub token (via the `gh` CLI or a git credential helper) and calls',
    '  this same API with a `Bearer` token.',
    `- **Browser** — open ${humanView} while signed in to Principal.`,
    '',
  ].join('\n');
}

/** Render a readable topic (curated trail bundle) as Markdown. */
export function topicMarkdown(opts: {
  topic: TopicPayload;
  links: TopicLinks;
  /** Per-trail links, in `topic.trailIds` order, resolved by the caller. */
  trails: Array<{ id: string; humanView: string; json: string }>;
}): string {
  const { topic, links, trails } = opts;
  const out: string[] = [];
  const n = topic.trailIds.length;

  out.push(`# ${topic.title}`);
  const subtitle = [`${n} trail${n === 1 ? '' : 's'}`];
  if (topic.status?.state) {
    subtitle.push(topic.status.label ?? topic.status.state);
  }
  out.push(`*${subtitle.join(' · ')}*`);
  if (topic.createdBy?.githubLogin) {
    out.push('', `**Curated by:** ${topic.createdBy.githubLogin}`);
  }

  // The description is author-written Markdown (the working brief); emit as-is.
  if (topic.description?.trim()) {
    out.push('', topic.description.trim());
  }

  out.push('', '## Trails');
  if (trails.length === 0) {
    out.push('_No trails in this topic yet._');
  } else {
    trails.forEach((t, i) => {
      out.push(`${i + 1}. \`${t.id}\``);
      out.push(`   View: ${t.humanView}`);
      out.push(`   JSON: ${t.json}`);
    });
  }

  out.push(
    '',
    '---',
    `Interactive view: ${links.humanView}`,
    `JSON: ${links.self} · Trails: ${links.trails}`,
    '',
  );
  return out.join('\n');
}

// ============================================================================
// Repo catalog. The `/{owner}/{repo}` page is a client-hydrated SPA, so a
// programmatic caller handed the bare repo URL only sees the shell. The
// middleware rewrites those non-browser navigations here, to a manifest that
// describes what the repo *is* (GitHub metadata) and what Principal *knows*
// about it (published trails + tours, each with a drill-in link). Topics are
// intentionally absent: they aren't repo-scoped, so there's no per-repo list.
// ============================================================================

/** GitHub-side facts about the repo, mirrored from {@link RepoAccessInfo}. */
export interface RepoCatalogInfo {
  description: string | null;
  primaryLanguage: string | null;
  defaultBranch: string;
  visibility: 'public' | 'private';
  topics: string[];
  stars: number;
  homepage: string | null;
  htmlUrl: string;
  pushedAt: string | null;
}

/** The subset of the repo catalog envelope's `_links` Markdown rendering needs. */
export interface RepoCatalogLinks {
  self: string;
  trails: string;
  tours: string;
  humanView: string;
}

/** One trail row in the catalog, with the fields Markdown rendering reads. */
export interface RepoCatalogTrailItem {
  title: string;
  summaryPreview?: string;
  markerCount: number;
  author?: string;
  humanView: string;
}

/** One tour row in the catalog, with the fields Markdown rendering reads. */
export interface RepoCatalogTourItem {
  title: string;
  stepCount: number;
  humanView: string;
}

/**
 * Repo-flavored variant of {@link cliHint} for a catalog `403`. Same mechanism
 * (a GitHub token resolved by the CLI), but worded for the repo, not a trail.
 */
export function repoCliHint() {
  return {
    cli: `npx ${CLI_PACKAGE}`,
    cliHint:
      `This repository is private or you lack read access. Principal gates ` +
      `repo catalogs by GitHub repository read access. \`npx ${CLI_PACKAGE}\` ` +
      `resolves your GitHub token (via the gh CLI or a git credential helper) ` +
      `and calls this same API with a Bearer token, so it returns the catalog ` +
      `whenever your GitHub account can read the repository.`,
  };
}

/** Markdown shown to a non-browser caller for a private / no-access repo. */
export function privateRepoMarkdown(humanView: string): string {
  return [
    '# Private repository',
    '',
    "This repository is private — or you don't have read access — so Principal's",
    'catalog of trails and tours for it is not available to anonymous callers.',
    '',
    'To view it as yourself:',
    '',
    `- **Browser** — open ${humanView} while signed in to Principal.`,
    `- **CLI** — \`npx ${CLI_PACKAGE}\` resolves your GitHub token (via the \`gh\``,
    '  CLI or a git credential helper) and reads anything your GitHub account can.',
    '',
  ].join('\n');
}

/** Render a repo catalog (GitHub facts + published trails/tours) as Markdown. */
export function repoCatalogMarkdown(opts: {
  owner: string;
  repo: string;
  info: RepoCatalogInfo;
  trails: RepoCatalogTrailItem[];
  tours: RepoCatalogTourItem[];
  links: RepoCatalogLinks;
}): string {
  const { owner, repo, info, trails, tours, links } = opts;
  const out: string[] = [];

  out.push(`# ${owner}/${repo}`);
  const sub: string[] = [info.visibility];
  if (info.primaryLanguage) sub.push(info.primaryLanguage);
  sub.push(`★ ${info.stars}`);
  sub.push(`${trails.length} trail${trails.length === 1 ? '' : 's'}`);
  sub.push(`${tours.length} tour${tours.length === 1 ? '' : 's'}`);
  out.push(`*${sub.join(' · ')}*`);

  if (info.description?.trim()) out.push('', info.description.trim());
  if (info.topics.length) out.push('', `**Topics:** ${info.topics.join(', ')}`);

  out.push('', '## Trails');
  if (trails.length === 0) {
    out.push('_No trails published for this repo yet._');
  } else {
    trails.forEach((t, i) => {
      const who = t.author ? ` · ${t.author}` : '';
      out.push(
        `${i + 1}. **${t.title}** — ${t.markerCount} marker${
          t.markerCount === 1 ? '' : 's'
        }${who}`,
      );
      if (t.summaryPreview?.trim()) out.push(indent(t.summaryPreview));
      out.push(`   ${t.humanView}`);
    });
  }

  out.push('', '## Tours');
  if (tours.length === 0) {
    out.push('_No tours published for this repo yet._');
  } else {
    tours.forEach((t, i) => {
      out.push(
        `${i + 1}. **${t.title}** — ${t.stepCount} step${
          t.stepCount === 1 ? '' : 's'
        }`,
      );
      out.push(`   ${t.humanView}`);
    });
  }

  out.push(
    '',
    '---',
    `Repository: ${info.htmlUrl}`,
    `Interactive view: ${links.humanView}`,
    `JSON: ${links.self}`,
    '',
  );
  return out.join('\n');
}
