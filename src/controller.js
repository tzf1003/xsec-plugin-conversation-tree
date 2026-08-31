import { DEFAULT_SCALE, validateTree } from "./core.js";
import { parseContext, sourceState } from "./context.js";
import {
  canStartNavigation,
  canStartRead,
  contextFailurePatch,
  isRequestCurrent,
  readResponsePatch,
  treeViewRevision,
} from "./controller-state.js";
import { ConversationTreeInteractions } from "./interactions.js";
import { graphModel, selectedModel } from "./model.js";
import { createShell } from "./shell.js";
import { installStyles } from "./styles.js";
import { renderFatal, renderView } from "./view.js";

const READ_METHOD = "xsec.conversation-tree.read";
const NAVIGATE_METHOD = "xsec.conversation-tree.navigate";

function errorMessage(value) {
  return value instanceof Error ? value.message : String(value);
}

function isHiddenContext(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && value.visible === false;
}

function contextForMount(value) {
  if (!isHiddenContext(value)) return parseContext(value);
  return {
    raw: value,
    workspace: null,
    session: null,
    tree: null,
    treeHash: null,
    sessionId: null,
    truncated: value.truncated === true,
    visible: false,
  };
}

function initialState(context) {
  return {
    context,
    tree: context.tree,
    treeHash: context.treeHash,
    source: sourceState(context),
    error: null,
    notice: null,
    loading: false,
    navigating: false,
    loadedTree: false,
    selectedId: null,
    mode: "all",
    showAgentMessages: false,
    query: "",
    contextExpanded: true,
    view: { x: 24, y: 24, scale: DEFAULT_SCALE },
    drag: null,
    generation: 0,
  };
}

export class ConversationTreeController {
  constructor(host) {
    this.host = host;
    this.root = null;
    this.controls = null;
    this.state = null;
    this.disposed = false;
    this.themeSubscription = null;
    this.interactions = new ConversationTreeInteractions(this);
    this.actions = {
      load: () => void this.load(),
      navigate: (entryId) => void this.navigate(entryId),
      ...this.interactions.actions(),
    };
  }

  render() {
    if (!this.controls) return null;
    try {
      const graph = graphModel(this.state);
      this.state.selectedId = graph?.selectedId ?? null;
      const selected = selectedModel(this.state, graph);
      renderView({ controls: this.controls, state: this.state, graph, selected, actions: this.actions });
      return graph;
    } catch (value) {
      this.state.error = `渲染对话树失败：${errorMessage(value)}`;
      renderFatal(this.controls, this.state.error);
      return null;
    }
  }

  updateContext(value) {
    if (isHiddenContext(value)) {
      this.suspend(value);
      return;
    }
    const next = this.parseUpdatedContext(value);
    if (!next) return;
    const currentId = this.state.context.sessionId ?? this.state.tree?.sessionId;
    const nextId = next.sessionId ?? next.tree?.sessionId;
    const changed = Boolean(nextId && currentId && nextId !== currentId);
    const previousViewRevision = treeViewRevision(this.state.tree);
    this.state.generation += 1;
    this.state.context = next;
    this.state.loading = false;
    this.state.navigating = false;
    this.state.notice = null;
    if (changed) this.resetSessionState(next);
    else this.applyContextTree(next);
    const viewChanged = changed || previousViewRevision !== treeViewRevision(this.state.tree);
    this.render();
    if (viewChanged) this.interactions.resetView();
  }

  parseUpdatedContext(value) {
    try {
      return parseContext(value);
    } catch (error) {
      const drag = this.state.drag;
      this.state.generation += 1;
      Object.assign(this.state, contextFailurePatch({
        context: this.state.context,
        raw: value,
        message: errorMessage(error),
      }));
      this.releaseDrag(drag);
      this.render();
      return null;
    }
  }

  suspend(value) {
    const drag = this.state.drag;
    this.state.generation += 1;
    this.state.context = { ...this.state.context, raw: value, visible: false };
    this.state.loading = false;
    this.state.navigating = false;
    this.state.drag = null;
    this.releaseDrag(drag);
    this.render();
  }

  releaseDrag(drag) {
    if (drag && this.controls?.canvas.hasPointerCapture(drag.pointerId)) {
      this.controls.canvas.releasePointerCapture(drag.pointerId);
    }
    this.controls?.canvas.classList.remove("is-dragging");
  }

  resetSessionState(context) {
    Object.assign(this.state, {
      tree: context.tree,
      treeHash: context.treeHash,
      source: sourceState(context),
      loadedTree: false,
      selectedId: null,
      query: "",
      mode: "all",
      showAgentMessages: false,
      view: { x: 24, y: 24, scale: DEFAULT_SCALE },
      error: null,
    });
  }

  applyContextTree(context) {
    if (context.tree) {
      Object.assign(this.state, { tree: context.tree, treeHash: context.treeHash, loadedTree: false, error: null });
    } else if (context.truncated) {
      this.state.treeHash = null;
    } else if (!this.state.loadedTree) {
      this.state.tree = null;
      this.state.treeHash = null;
    }
    this.state.source = sourceState(context, this.state.loadedTree && Boolean(this.state.tree));
  }

  requestFence() {
    return { generation: ++this.state.generation, sessionId: this.state.context.sessionId };
  }

  isCurrent(fence) {
    return isRequestCurrent({ disposed: this.disposed, state: this.state, fence });
  }

  async load() {
    if (!canStartRead({
      disposed: this.disposed,
      loading: this.state.loading,
      navigating: this.state.navigating,
      visible: this.state.context.visible,
    })) return;
    const fence = this.requestFence();
    Object.assign(this.state, { loading: true, error: null, notice: null });
    this.render();
    try {
      const response = await this.host.request(READ_METHOD, {});
      if (!this.isCurrent(fence)) return;
      this.acceptReadResponse(response);
    } catch (value) {
      if (this.isCurrent(fence)) this.state.error = `读取对话树失败：${errorMessage(value)}`;
    }
    if (!this.isCurrent(fence)) return;
    this.state.loading = false;
    this.render();
    this.interactions.resetView();
  }

  acceptReadResponse(response) {
    Object.assign(this.state, readResponsePatch(response));
  }

  async navigate(entryId) {
    if (!canStartNavigation({ disposed: this.disposed, loading: this.state.loading, navigating: this.state.navigating, visible: this.state.context.visible })) return;
    try {
      await this.performNavigation(entryId);
    } catch (value) {
      this.state.error = `切换分支失败：${errorMessage(value)}`;
      this.state.navigating = false;
      this.render();
      this.interactions.resetView();
    }
  }

  navigationRequest(entryId) {
    const graph = graphModel(this.state);
    const selected = selectedModel(this.state, graph);
    if (!selected || selected.selected.entryId !== entryId) {
      throw new Error("conversation_tree_navigation_selection_mismatch");
    }
    if (selected.navigationBlock) throw new Error(selected.navigationBlock);
    if (!this.state.treeHash) throw new Error("conversation_tree_missing_tree_hash");
    return { targetEntryId: entryId, expectedTreeHash: this.state.treeHash };
  }

  async performNavigation(entryId) {
    const request = this.navigationRequest(entryId);
    const fence = this.requestFence();
    Object.assign(this.state, { navigating: true, error: null });
    this.render();
    let response;
    try {
      response = await this.host.request(NAVIGATE_METHOD, request);
    } catch (error) {
      if (this.isCurrent(fence)) throw error;
      return;
    }
    if (!this.isCurrent(fence)) return;
    this.acceptNavigation(response, entryId);
    this.state.navigating = false;
    this.render();
    this.interactions.resetView();
  }

  acceptNavigation(response, entryId) {
    Object.assign(this.state, {
      tree: validateTree(response?.result),
      treeHash: null,
      loadedTree: true,
      source: { availability: "ready", label: "已切换" },
      notice: "分支已切换；等待宿主发布新的权威树摘要。",
      selectedId: entryId,
    });
  }

  applyTheme(theme) {
    document.documentElement.dataset.xsecTheme = theme?.["color-mode"] === "light" ? "light" : "dark";
  }

  async mount(nextRoot, initialContext) {
    this.root = nextRoot;
    installStyles();
    this.state = initialState(contextForMount(initialContext));
    this.controls = createShell(this.root, this.actions);
    const mode = getComputedStyle(document.documentElement).getPropertyValue("--xsec-color-mode").trim();
    this.applyTheme({ "color-mode": mode });
    this.themeSubscription = this.host.onTheme((theme) => this.applyTheme(theme));
    this.render();
    if (this.state.tree) this.interactions.resetView();
  }

  async update(nextContext) {
    if (!this.disposed) this.updateContext(nextContext);
  }

  async dispose() {
    this.disposed = true;
    this.state.generation += 1;
    this.themeSubscription?.dispose();
    this.root?.replaceChildren();
  }
}

export function createController(host) {
  return new ConversationTreeController(host);
}
