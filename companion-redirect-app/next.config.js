/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use edge runtime for faster redirects
  experimental: {
    runtime: 'edge'
  }
}

module.exports = nextConfig

