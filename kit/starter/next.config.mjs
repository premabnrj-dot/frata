/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Photos come from Frrata's media store as finished URLs (srcset): plain <img>, no optimiser.
  images: { unoptimized: true },
}
