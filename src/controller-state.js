import { validateTree } from "./core.js";

const READ_STATUS_LABELS = {
  verification_pending: "核验中",
  conflict_deferred: "有冲突",
  busy: "运行中",
  runtime_unavailable: "待加载",
  unverifiable: "不可核验",
};

export function canStartRead({ disposed, loading, visible }) {
  return !disposed && !loading && visible;
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

export function readResponsePatch(response) {
  if (!response || typeof response !== "object" || typeof response.status !== "string") {
    throw new Error("conversation_tree_invalid_read_response");
  }
  if (response.status === "ready") {
    return {
      tree: validateTree(response.tree),
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
