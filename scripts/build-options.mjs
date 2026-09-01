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
  minifyIdentifiers: false,
  minifySyntax: true,
  minifyWhitespace: true,
  legalComments: "none",
  banner: { js: "/* Generated from src/ by npm run build. */" },
  footer: {
    js: `export function activate(host) {
  async function readTree() { return host.request("xsec.conversation-tree.read", {}); }
  async function navigateTree(request) { return host.request("xsec.conversation-tree.navigate", request); }
  const controller = createController(host);
  controller.onRead = readTree;
  controller.onNavigate = navigateTree;
  return {
    mount(root, context) { return controller.mount(root, context); },
    update(context) { return controller.update(context); },
    dispose() { return controller.dispose(); },
  };
}`,
  },
};
