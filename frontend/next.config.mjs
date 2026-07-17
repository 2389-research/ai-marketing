/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // @remotion/bundler and @remotion/renderer ship native binaries webpack
  // can't parse — run them via Node's require() at runtime instead of
  // trying to bundle them into the route's webpack chunk.
  experimental: {
    serverComponentsExternalPackages: ['@remotion/bundler', '@remotion/renderer', 'remotion'],
  },
}
export default nextConfig
