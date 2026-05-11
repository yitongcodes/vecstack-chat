/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vecstack/shared'],
  reactStrictMode: true,
  // Export as static files; the room-server serves them from one process/port.
  output: 'export',
};

export default nextConfig;
