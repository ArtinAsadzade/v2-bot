/** @type {import('next').NextConfig} */
const useStandalone =
  process.env.NEXT_STANDALONE === '1' || process.platform !== 'win32';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(useStandalone ? { output: 'standalone' } : {}),
};

export default nextConfig;
