import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export const outputPath = fileURLToPath(new URL(
  "../plugins/com.xsec.workspace.conversation-tree/com.xsec.desktop/frontend/index.js",
  import.meta.url,
));

export const buildOptions = {
  absWorkingDir: root,
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  banner: { js: "/* Generated from src/ by npm run build. */" },
};
