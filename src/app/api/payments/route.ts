import { defineRoute } from '@/server/http/route';
import { CAPABILITIES } from '@/lib/constants';
import { listPayments } from '@/server/services/payments';

export const dynamic = 'force-dynamic';

/**
 * The payments register.
 *
 * Scoped through the application like everything else, so this one endpoint
 * serves an LTP looking at their own payments and a finance officer looking at
 * every payment in the city — with no second authorization path to keep in
 * step with the first.
 */
export const GET = defineRoute(
  async ({ user, searchParams }) =>
    listPayments(user, {
      status: searchParams.get('status') ?? undefined,
      search: searchParams.get('q') ?? undefined,
      page: Number(searchParams.get('page') ?? 1) || 1,
      pageSize: Number(searchParams.get('pageSize') ?? 25) || 25,
    }),
  { capabilities: [CAPABILITIES.PAYMENT_VIEW] }
);
