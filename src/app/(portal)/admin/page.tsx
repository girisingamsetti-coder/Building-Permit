import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Administration' };

/**
 * The admin landing is the admin dashboard, which lives at /dashboard and
 * switches on role. One dashboard implementation, not two.
 */
export default function AdminIndex() {
  redirect('/dashboard');
}
