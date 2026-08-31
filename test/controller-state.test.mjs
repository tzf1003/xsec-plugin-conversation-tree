import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartNavigation,
  canStartRead,
  contextFailurePatch,
  isRequestCurrent,
  readResponsePatch,
  requestAuthorityRevision,
  treeViewRevision,
  validateNavigationTree,
  validateResponseTree,
} from "../src/controller-state.js";
import { message, tree } from "./fixtures.mjs";

test("hidden context cannot start a tree read", () => {
  assert.equal(canStartRead({ disposed: false, loading: false, navigating: false, readSupported: true, visible: false }), false);
  assert.equal(canStartRead({ disposed: false, loading: false, navigating: false, readSupported: true, visible: true }), true);
});

test("reads and navigation cannot overlap", () => {
  assert.equal(canStartRead({ disposed: false, loading: false, navigating: true, readSupported: true, visible: true }), false);
  assert.equal(canStartRead({ disposed: false, loading: false, navigating: false, readSupported: false, visible: true }), false);
  assert.equal(canStartNavigation({ disposed: false, loading: true, navigating: false, visible: true }), false);
  assert.equal(canStartNavigation({ disposed: false, loading: false, navigating: false, visible: true }), true);
});

test("request authority changes only with session or authoritative hash", () => {
  const original = { sessionId: "session-1", treeHash: "hash-1" };
  assert.equal(requestAuthorityRevision({ ...original, visible: false }), requestAuthorityRevision(original));
  assert.notEqual(requestAuthorityRevision({ ...original, treeHash: "hash-2" }), requestAuthorityRevision(original));
  assert.notEqual(requestAuthorityRevision({ ...original, sessionId: "session-2" }), requestAuthorityRevision(original));
});

test("viewport revision tracks layout and active branch changes", () => {
  const original = tree([message("root", { active: true })], { activeLeafId: "root" });
  assert.equal(treeViewRevision({ ...original, messages: [{ ...original.messages[0], text: "updated" }] }), treeViewRevision(original));
  assert.notEqual(treeViewRevision({ ...original, activeLeafId: null }), treeViewRevision(original));
  assert.notEqual(treeViewRevision({ ...original, messages: [{ ...original.messages[0], active: false }] }), treeViewRevision(original));
  assert.notEqual(treeViewRevision({ ...original, messages: [...original.messages, message("leaf", { parentId: "root" })] }), treeViewRevision(original));
});

test("request fencing rejects stale generation and session results", () => {
  const state = { generation: 4, context: { sessionId: "session-b" } };
  assert.equal(isRequestCurrent({
    disposed: false,
    state,
    fence: { generation: 3, sessionId: "session-b" },
  }), false);
  assert.equal(isRequestCurrent({
    disposed: false,
    state,
    fence: { generation: 4, sessionId: "session-a" },
  }), false);
  assert.equal(isRequestCurrent({
    disposed: false,
    state,
    fence: { generation: 4, sessionId: "session-b" },
  }), true);
});

test("invalid host context revokes navigation authority and suspends interaction", () => {
  const current = { sessionId: "session-a", visible: true };
  const patch = contextFailurePatch({ context: current, raw: { broken: true }, message: "invalid" });
  assert.equal(patch.context.visible, false);
  assert.equal(patch.treeHash, null);
  assert.equal(patch.loading, false);
  assert.equal(patch.navigating, false);
});

test("non-ready reads revoke the previous authoritative hash", () => {
  const patch = readResponsePatch({ status: "busy" });
  assert.equal(patch.treeHash, null);
  assert.deepEqual(patch.source, { availability: "busy", label: "运行中" });
  assert.match(patch.notice, /暂不可读/);
});

test("explicit ready reads stay browse-only until context publishes a hash", () => {
  const patch = readResponsePatch({ status: "ready", tree: tree([
    message("root", { active: true }),
  ], { activeLeafId: "root" }) }, "session-1");
  assert.equal(patch.treeHash, null);
  assert.equal(patch.loadedTree, true);
  assert.equal(patch.tree.activeLeafId, "root");
});

test("host responses must match the bound session", () => {
  assert.throws(() => validateResponseTree(tree([], { sessionId: "session-2" }), "session-1"), /response_session_mismatch/);
  assert.throws(() => validateResponseTree(tree([], { sessionId: "session-1" }), null), /response_session_mismatch/);
});

test("navigation results must resolve to the requested target", () => {
  const result = tree([
    message("root", { active: true }),
    message("leaf", { parentId: "root", active: true }),
  ], { activeLeafId: "leaf" });
  assert.equal(validateNavigationTree(result, "session-1", "leaf").activeLeafId, "leaf");
  assert.throws(() => validateNavigationTree(result, "session-1", "root"), /navigation_target_mismatch/);
});
