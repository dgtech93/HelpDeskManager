import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPLASH_PNG = path.join(__dirname, "public", "splash-boot.png");

/** Incorpora lo splash nel primo HTML: niente frame “solo blu” in attesa del PNG su rete. */
function inlineBootSplash(): Plugin {
  let dataUri = "";
  const load = () => {
    dataUri = `data:image/png;base64,${fs.readFileSync(SPLASH_PNG).toString("base64")}`;
  };
  return {
    name: "inline-boot-splash",
    buildStart() {
      load();
    },
    transformIndexHtml(html) {
      if (!dataUri) load();
      return html.replaceAll("__INLINE_SPLASH_URI__", dataUri);
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  /** Così anche URL senza hash (es. /web in anteprima browser) servono index.html e il router può gestire la navigazione. */
  appType: "spa",
  plugins: [inlineBootSplash(), react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
