import { validateTree } from "./core.js";

const READ_STATUS_LABELS = {
  verification_pending: "核验中",
  conflict_deferred: "有冲突",
  busy: "运行中",
  runtime_unavailable: "待加载",
  unverifiable: "不可核验",
};

export function canStartRead({ disposed, loading, navigating, readSupported, visible }) {
  return !disposed && !loading && !navigating && readSupported && visible;
}

export function canStartNavigation({ disposed, loading, navigating, visible }) {
  return !disposed && !loading && !navigating && visible;
}

export function treeViewRevision(tree) {
  if (!tree) return null;
  const nodes = tree.messages.map((message) => [
    message.entryId,
    message.parentId,
    message.branchGroupId,
    message.role,
    message.timestamp,
    message.active,
  ]);
  return JSON.stringify([tree.sessionId, tree.activeLeafId, nodes]);
}

export function requestAuthorityRevision(context) {
  return JSON.stringify([context.sessionId, context.treeHash]);
}

export function isRequestCurrent({ disposed, state, fence }) {
  return !disposed
    && fence.generation === state.generation
    && fence.sessionId === state.context.sessionId;
}

export function contextFailurePatch({ context, raw, message }) {
  return {
    context: { ...context, raw, visible: false },
    treeHash: null,
    error: `读取宿主上下文失败：${message}`,
    loading: false,
    navigating: false,
    drag: null,
  };
}

export function readResponsePatch(response, expectedSessionId) {
  if (!response || typeof response !== "object" || typeof response.status !== "string") {
    throw new Error("conversation_tree_invalid_read_response");
  }
  if (response.status === "ready") {
    return {
      tree: validateResponseTree(response.tree, expectedSessionId),
      treeHash: null,
      loadedTree: true,
      source: { availability: "ready", label: "已读取" },
      selectedId: null,
    };
  }
  const label = READ_STATUS_LABELS[response.status];
  if (!label) throw new Error(`conversation_tree_unknown_read_status: ${response.status}`);
  return {
    treeHash: null,
    source: { availability: response.status, label },
    notice: `对话树暂不可读：${label}`,
  };
}

export function validateResponseTree(value, expectedSessionId) {
  const tree = validateTree(value);
  if (!expectedSessionId || tree.sessionId !== expectedSessionId) {
    throw new Error("conversation_tree_response_session_mismatch");
  }
  return tree;
}
