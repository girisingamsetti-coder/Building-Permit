'use client';

import * as React from 'react';
import {
  Bell,
  Mail,
  MessageSquare,
  Lock,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  FileText,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import type { EventPreferenceItem } from '@/server/notifications/preferences';

export function NotificationPreferencesTab({
  initialPreferences,
}: {
  initialPreferences: EventPreferenceItem[];
}) {
  const [preferences, setPreferences] = React.useState<EventPreferenceItem[]>(initialPreferences);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const categories = React.useMemo(() => {
    const map = new Map<string, EventPreferenceItem[]>();
    for (const item of preferences) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [preferences]);

  const handleToggle = async (
    eventCode: string,
    channel: 'IN_APP' | 'EMAIL' | 'SMS',
    nextValue: boolean,
    mandatory: boolean
  ) => {
    if (mandatory) {
      toast.info('Mandatory Notification', {
        description: 'Critical statutory workflow alerts cannot be disabled.',
      });
      return;
    }

    const key = `${eventCode}:${channel}`;
    setSavingKey(key);

    // Optimistic UI update
    setPreferences((prev) =>
      prev.map((item) => {
        if (item.eventCode === eventCode) {
          return {
            ...item,
            channels: {
              ...item.channels,
              [channel]: nextValue,
            },
          };
        }
        return item;
      })
    );

    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventCode,
          channel,
          enabled: nextValue,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update preference');
      }

      toast.success('Preferences updated');
    } catch {
      toast.error('Could not save preference change');
      // Revert optimistic update
      setPreferences(initialPreferences);
    } finally {
      setSavingKey(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Applications':
        return <FileText className="size-4 text-primary" />;
      case 'Payments':
        return <CreditCard className="size-4 text-emerald-600 dark:text-emerald-400" />;
      case 'Shortfalls':
        return <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />;
      case 'Approvals':
        return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />;
      default:
        return <Shield className="size-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border/60 py-3.5">
          <CardTitle className="text-body font-bold flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <span>Communication & Notification Preferences</span>
          </CardTitle>
          <CardDescription>
            Choose your preferred delivery channels for workflow events. Statutory and critical notices remain mandatory.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0 divide-y divide-border/60">
          {categories.map(([category, items]) => (
            <div key={category} className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                {getCategoryIcon(category)}
                <h4 className="text-small font-bold uppercase tracking-wider text-text">
                  {category} Notifications
                </h4>
              </div>

              <div className="space-y-2 rounded-xl border border-border/80 bg-surface-sunk/40 p-2 sm:p-3">
                {items.map((item) => (
                  <div
                    key={item.eventCode}
                    className="flex flex-col gap-2 rounded-lg bg-surface p-3 sm:flex-row sm:items-center sm:justify-between border border-border/50 shadow-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text">{item.label}</span>
                        {item.mandatory && (
                          <Badge tone="warning" className="gap-1 text-caption">
                            <Lock className="size-2.5" />
                            Mandatory
                          </Badge>
                        )}
                      </div>
                      <p className="text-caption font-mono text-text-muted">{item.eventCode}</p>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 pt-1 sm:pt-0">
                      {/* In-App Toggle */}
                      <label className="flex items-center gap-1.5 cursor-pointer text-caption">
                        <Bell className="size-3.5 text-text-muted" />
                        <span className="font-medium text-text">In-App</span>
                        <Switch
                          checked={item.channels.IN_APP}
                          disabled={item.mandatory || savingKey === `${item.eventCode}:IN_APP`}
                          onCheckedChange={(val) =>
                            handleToggle(item.eventCode, 'IN_APP', val, item.mandatory)
                          }
                          aria-label={`In-App for ${item.label}`}
                        />
                      </label>

                      {/* Email Toggle */}
                      <label className="flex items-center gap-1.5 cursor-pointer text-caption">
                        <Mail className="size-3.5 text-text-muted" />
                        <span className="font-medium text-text">Email</span>
                        <Switch
                          checked={item.channels.EMAIL}
                          disabled={item.mandatory || savingKey === `${item.eventCode}:EMAIL`}
                          onCheckedChange={(val) =>
                            handleToggle(item.eventCode, 'EMAIL', val, item.mandatory)
                          }
                          aria-label={`Email for ${item.label}`}
                        />
                      </label>

                      {/* SMS Toggle */}
                      <label className="flex items-center gap-1.5 cursor-pointer text-caption">
                        <MessageSquare className="size-3.5 text-text-muted" />
                        <span className="font-medium text-text">SMS</span>
                        <Switch
                          checked={item.channels.SMS}
                          disabled={item.mandatory || savingKey === `${item.eventCode}:SMS`}
                          onCheckedChange={(val) =>
                            handleToggle(item.eventCode, 'SMS', val, item.mandatory)
                          }
                          aria-label={`SMS for ${item.label}`}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
