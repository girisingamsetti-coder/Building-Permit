import { Badge } from '@/components/ui/badge';
import { statusMeta, type StatusKind } from '@/lib/status';

/**
 * The only component that turns a status into a colour. Everything else asks
 * for one of these, so the mapping cannot drift across screens.
 */
export function StatusBadge({
  status,
  kind = 'application',
  className,
}: {
  status: string | null | undefined;
  kind?: StatusKind;
  className?: string;
}) {
  const { label, tone } = statusMeta(kind, status);
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
