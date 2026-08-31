import assert from "node:assert/strict";
import test from "node:test";
import { navigationBlock, parseContext } from "../src/index.js";
import { context, message, tree } from "./fixtures.mjs";

const projection = tree([
  message("root", { active: true }),
  message("leaf", { parentId: "root", active: true }),
], { activeLeafId: "leaf" });

test("cached context is the authoritative tree and hash source", () => {
  const parsed = parseContext(context(projection));
  assert.equal(parsed.tree.activeLeafId, "leaf");
  assert.equal(parsed.treeHash, "hash-1");
  assert.equal(navigationBlock(parsed, parsed.tree, parsed.treeHash), null);
});

test("navigation fails closed without the authoritative hash", () => {
  const parsed = parseContext(context(projection));
  assert.match(navigationBlock(parsed, parsed.tree, null), /权威树摘要/);
});

test("busy, unsynchronized and hidden sessions block navigation", () => {
  const busy = parseContext(context(projection, { status: "running" }));
  assert.match(navigationBlock(busy, busy.tree, busy.treeHash), /运行中/);
  const pending = parseContext(context(projection, { consistency: "verification_pending" }));
  assert.match(navigationBlock(pending, pending.tree, pending.treeHash), /尚未同步/);
  const hidden = parseContext(context(projection, { visible: false }));
  assert.match(navigationBlock(hidden, hidden.tree, hidden.treeHash), /不可见/);
  const interaction = parseContext(context(projection, { pendingInteractions: { approval: {} } }));
  assert.match(navigationBlock(interaction, interaction.tree, interaction.treeHash), /待处理交互/);
});

test("truncated context remains explicit and contains no navigation hash", () => {
  const parsed = parseContext({ truncated: true, reason: "host context exceeds sandbox message limit", workspace: {} });
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.tree, null);
  assert.equal(parsed.treeHash, null);
});
