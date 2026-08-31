import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LTP Approval Management System',
    template: '%s · LAMS',
  },
  description: 'Building permission application, scrutiny and approval platform.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-body antialiased">{children}</body>
    </html>
  );
}
