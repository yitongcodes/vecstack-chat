import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VecStack Chat',
  description: 'Humans and agents, in the same room.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
