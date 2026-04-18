import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const daemonHost = (process.env.AGENT_DAEMON_HOST ?? "127.0.0.1").trim();
const daemonPort = (
  Number.parseInt(String(process.env.AGENT_DAEMON_PORT ?? "8787").trim(), 10) ||
  8787
).toString();
const webPort =
  Number.parseInt(String(process.env.ADF_WEB_PORT ?? "5173").trim(), 10) ||
  5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://${daemonHost}:${daemonPort}`,
        changeOrigin: true,
      },
    },
  },
});
