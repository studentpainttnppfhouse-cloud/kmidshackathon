import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/authorize";
import { KIND_LABEL, searchPortal } from "@/lib/search";
import { RULES, rateLimit } from "@/lib/rate-limit";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const KINDS = ["assignment", "document", "file", "person", "announcement", "form", "department"] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const viewer = await requireViewer();
  const { q, kind } = await searchParams;
  const query = (q ?? "").trim();

  // A search box is a query generator pointed at seven tables. Throttled per
  // account so a stuck client — or somebody holding down a key — cannot turn it
  // into a load test.
  const limit = query.length >= 2 ? rateLimit(`search:${viewer.id}`, RULES.search) : { ok: true };

  const hits = limit.ok && query.length >= 2 ? await searchPortal(viewer, query) : [];
  const filtered =
    kind && (KINDS as readonly string[]).includes(kind) ? hits.filter((h) => h.kind === kind) : hits;

  const counts = new Map<string, number>();
  for (const hit of hits) counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);

  return (
    <div className="hs-enter space-y-5">
      <PageHeader
        eyebrow="Search"
        title={query ? `Results for “${query}”` : "Search the portal"}
        subtitle="Tasks, documents, assets, people, announcements, forms and departments — everything you have access to, in one place."
      />

      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          What are you looking for?
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          autoFocus
          placeholder="A task, a name, a document…"
          className="hs-input max-w-md"
        />
        <button type="submit" className="hs-btn hs-btn-primary">
          Search
        </button>
      </form>

      {!limit.ok ? (
        <p className="hs-feedback hs-feedback-error" role="alert">
          <span aria-hidden="true">⚠</span> That is a lot of searching at once. Give it a moment.
        </p>
      ) : null}

      {query.length > 0 && query.length < 2 ? (
        <p className="text-sm text-muted">Type at least two characters.</p>
      ) : null}

      {hits.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label={`Everything (${hits.length})`} href={`/search?q=${encodeURIComponent(query)}`} active={!kind} />
          {KINDS.filter((k) => counts.get(k)).map((k) => (
            <FilterChip
              key={k}
              label={`${KIND_LABEL[k]} (${counts.get(k)})`}
              href={`/search?q=${encodeURIComponent(query)}&kind=${k}`}
              active={kind === k}
            />
          ))}
        </div>
      ) : null}

      {query.length >= 2 && filtered.length === 0 ? (
        <EmptyState
          title="Nothing matched"
          hint="Try a shorter word. Search only covers what your tier can already see."
        />
      ) : null}

      <ul className="space-y-2">
        {filtered.map((hit) => (
          <li key={`${hit.kind}-${hit.id}`}>
            <Link href={hit.href} className="hs-search-hit">
              <span className="mb-1 flex flex-wrap items-center gap-2">
                <span className="hs-pill bg-pink-50 text-pink-700">{KIND_LABEL[hit.kind]}</span>
                <span className="text-sm font-bold text-ink">{hit.title}</span>
              </span>
              {hit.context ? (
                <span className="block line-clamp-2 text-xs text-muted">{hit.context}</span>
              ) : null}
              <span className="mt-1 block text-[11px] text-faint">{hit.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        active ? "bg-brand text-white" : "bg-surface text-muted hover:text-pink-700"
      }`}
    >
      {label}
    </Link>
  );
}
