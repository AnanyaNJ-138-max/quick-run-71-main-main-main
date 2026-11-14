// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "local-tesseract-english-model",
        configureServer(server) {
          server.middlewares.use("/tesseract/eng.traineddata.gz", async (_request, response) => {
            try {
              const model = await readFile(
                resolve("node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz"),
              );
              response.setHeader("Content-Type", "application/gzip");
              response.end(model);
            } catch (error) {
              response.statusCode = 500;
              response.end("The local English OCR model could not be loaded.");
              server.config.logger.error(
                error instanceof Error
                  ? `Failed to load the local Tesseract English model: ${error.message}`
                  : "Failed to load the local Tesseract English model.",
              );
            }
          });
        },
        async generateBundle() {
          const model = await readFile(
            resolve("node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz"),
          );
          this.emitFile({
            type: "asset",
            fileName: "tesseract/eng.traineddata.gz",
            source: model,
          });
        },
      },
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
