import RoomClient from './RoomClient';

// generateStaticParams is required for dynamic routes with output:'export'.
// We return a single placeholder so Next.js is satisfied; every real room URL
// is served via the SPA fallback (index.html) and resolved client-side.
export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function RoomPage() {
  return <RoomClient />;
}
