import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pg', 'sharp'],
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  webpack(config) {
    config.resolve.alias['@'] = path.join(root, 'src');
    return config;
  },
};
export default nextConfig;
