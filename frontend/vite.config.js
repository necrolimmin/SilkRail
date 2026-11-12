import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // local backend runs on 8010 (8000 is taken by another project); Docker on the server is not affected
    proxy: { "/api": "http://127.0.0.1:8010", "/static": "http://127.0.0.1:8010" },
  },
});
