import { Skeleton } from '@/components/ui/skeleton';

/**
 * The register's loading state.
 *
 * Mirrors the real layout — heading, filter row, table — rather than showing a
 * centred spinner. The page then resolves into itself instead of replacing one
 * screen with a different one, which is what makes a list feel fast even when
 * it is not.
 *
 * ── WHY THIS LIVES IN A `(register)` ROUTE GROUP ───────────────────────────
 *
 * DO NOT move this file up to `applications/loading.tsx`, and do not add a
 * `loading.tsx` beside `[id]/page.tsx`. Either one silently breaks the HTTP
 * status of every unknown application URL.
 *
 * A `loading.tsx` creates a Suspense boundary around everything BELOW its
 * segment. That lets Next flush the document shell immediately — which commits
 * the `200` status line to the wire — before `[id]`'s `generateMetadata` has
 * finished the query that decides whether the application exists. The later
 * `notFound()` then renders the correct page with the wrong status, and a
 * `redirect()` degrades to a visible `<meta refresh>`.
 *
 * The route group is what confines the boundary to the list, which can never
 * 404, and leaves `[id]` unboundaried so its 404 and 307 are real. Measured,
 * not assumed — tests/http/routes.test.ts pins all of it.
 */
export default function ApplicationsLoading() {
  return (
    <div>
      <div className="pb-5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-sm" />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 min-w-[16rem] flex-1" />
          <Skeleton className="h-9 w-[11rem]" />
          <Skeleton className="h-9 w-[13rem]" />
        </div>

        <div className="rounded border border-border bg-surface p-4">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
