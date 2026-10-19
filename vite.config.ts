import fs from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// Blocks hosted login sets a Secure cookie scoped to the project domain, so local
// dev runs over HTTPS on VITE_BLOCKS_DEV_HOST (mapped to 127.0.0.1 in the hosts file).
// Run `pnpm cert` once to create .cert/ and trust the cert. Without it, dev falls back to HTTP.
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const domain = env.VITE_BLOCKS_DEV_HOST || undefined
  const port = Number(env.VITE_BLOCKS_DEV_PORT || 5173)
  const https =
    fs.existsSync(".cert/dev-key.pem") && fs.existsSync(".cert/dev-cert.pem")
      ? {
          key: fs.readFileSync(".cert/dev-key.pem"),
          cert: fs.readFileSync(".cert/dev-cert.pem"),
        }
      : undefined

  const { version } = JSON.parse(fs.readFileSync("package.json", "utf8")) as { version: string }

  return {
    plugins: [react(), tailwindcss()],
    // Shown in the app footer.
    define: { __APP_VERSION__: JSON.stringify(version) },
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      allowedHosts: domain ? [domain, "localhost"] : undefined,
      host: https && domain ? domain : undefined,
      https,
      port,
      // The port is part of the registered OIDC redirect URI, so it must not drift.
      strictPort: true,
    },
  }
})
