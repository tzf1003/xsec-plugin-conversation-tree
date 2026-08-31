import assert from "node:assert/strict";
import test from "node:test";
import { ConversationTreeController } from "../src/controller.js";

test("dispose is safe before mount completes", async () => {
  const controller = new ConversationTreeController({});
  await controller.dispose();
  assert.equal(controller.disposed, true);
});
