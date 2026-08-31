import assert from "node:assert/strict";
import test from "node:test";
import { ConversationTreeController } from "../src/controller.js";
import { canReadTree, parseContext, sourceState } from "../src/context.js";
import { context, message, tree } from "./fixtures.mjs";

const projection = tree([message("root", { active: true })], { activeLeafId: "root" });
const unsupportedContext = {
  visible: true,
  workspace: {
    session: {
      session_id: "session-1",
      tree_capability: { snapshot: false, navigate: false },
    },
  },
};

function stateFor(parsed, overrides = {}) {
  return {
    context: parsed,
    tree: parsed.tree,
    treeHash: parsed.treeHash,
    source: sourceState(parsed),
    error: "old context error",
    notice: null,
    loading: true,
    navigating: false,
    loadedTree: false,
    generation: 4,
    ...overrides,
  };
}

test("dispose is safe before mount completes", async () => {
  const controller = new ConversationTreeController({});
  await controller.dispose();
  assert.equal(controller.disposed, true);
});

test("same-authority updates preserve requests and clear recovered context errors", () => {
  const controller = new ConversationTreeController({});
  controller.state = stateFor(parseContext(context(projection)));
  controller.render = () => null;
  controller.interactions.resetView = () => {};
  controller.updateContext(context(projection, { status: "running" }));
  assert.equal(controller.state.generation, 4);
  assert.equal(controller.state.loading, true);
  assert.equal(controller.state.error, null);
});

test("new tree authority invalidates an in-flight request", () => {
  const controller = new ConversationTreeController({});
  controller.state = stateFor(parseContext(context(projection)));
  controller.render = () => null;
  controller.interactions.resetView = () => {};
  controller.updateContext(context(projection, { treeHash: "hash-2" }));
  assert.equal(controller.state.generation, 5);
  assert.equal(controller.state.loading, false);
});

test("valid no-tree recovery clears context errors", () => {
  const parsed = parseContext(unsupportedContext);
  const controller = new ConversationTreeController({});
  controller.state = stateFor(parsed, { loading: false });
  controller.render = () => null;
  controller.interactions.resetView = () => {};
  controller.updateContext(unsupportedContext);
  assert.equal(controller.state.error, null);
  assert.equal(controller.state.tree, null);
});

test("unsupported snapshots cannot reach the host read boundary", async () => {
  let requests = 0;
  const controller = new ConversationTreeController({ request: async () => { requests += 1; } });
  controller.state = stateFor(parseContext(unsupportedContext), { loading: false });
  controller.render = () => null;
  await controller.load();
  assert.equal(requests, 0);
});

test("an unbound workspace cannot reach the host read boundary", async () => {
  let requests = 0;
  const parsed = parseContext({ visible: true, workspace: {} });
  const controller = new ConversationTreeController({ request: async () => { requests += 1; } });
  controller.state = stateFor(parsed, { loading: false });
  controller.render = () => null;
  assert.equal(canReadTree(parsed), false);
  await controller.load();
  assert.equal(requests, 0);
});

test("an unbound workspace clears a previously loaded snapshot", () => {
  const controller = new ConversationTreeController({});
  controller.state = stateFor(parseContext(context(projection)), { loadedTree: true, loading: false });
  controller.render = () => null;
  controller.interactions.resetView = () => {};
  controller.updateContext({ visible: true, workspace: {} });
  assert.equal(controller.state.tree, null);
  assert.equal(controller.state.loadedTree, false);
});
