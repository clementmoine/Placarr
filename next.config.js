/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.rawg.io",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "api.deezer.com",
      },
      {
        protocol: "https",
        hostname: "cdn-images.dzcdn.net",
      },
      {
        protocol: "https",
        hostname: "cf.geekdo-images.com",
      },
      {
        protocol: "https",
        hostname: "books.google.com",
      },
    ],
  },
};

module.exports = nextConfig;
