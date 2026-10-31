import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Allow Turbopack to resolve packages and dependencies across the workspace root
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
