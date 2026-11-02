import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlan, planProject, splitScript } from "../server/planner.mjs";
import { Ollama } from "../server/ollama.mjs";

const valid = () => ({
  summary: "猫的故事",
  assets: [
    { id: "cat", name: "橘猫", kind: "character", description: "橘色短毛" },
  ],
  scenes: [{ id: "street", title: "清晨街道", description: "清晨" }],
  shots: [
    {
      id: "s1",
      sceneId: "street",
      title: "猫走过",
      prompt: "固定镜头，一只橘猫缓慢走过街道，自然光，环境声。",
      duration: 5,
      assetIds: ["cat"],
      camera: "固定",
      locked: false,
    },
  ],
});
test("model output cannot lock unreviewed shots on the users behalf", async () => {
  const output = valid();
  output.shots[0].locked = true;
  const engine = {
    chat: async () => JSON.stringify(output),
    unload: async () => {},
  };
  const result = await planProject(
    { script: "橘猫走过", style: "写实", plan: null },
    { model: "qwen3:8b" },
    { engine },
  );
  assert.equal(result.shots[0].locked, false);
});
test("plan rejects duplicate IDs, dangling assets and invalid durations", () => {
  assert.equal(validatePlan(valid()).shots[0].duration, 5);
  const duplicate = valid();
  duplicate.shots.push({ ...duplicate.shots[0] });
  assert.throws(() => validatePlan(duplicate));
  const dangling = valid();
  dangling.shots[0].assetIds = ["ghost"];
  assert.throws(() => validatePlan(dangling));
  const duration = valid();
  duration.shots[0].duration = 60;
  assert.throws(() => validatePlan(duration));
});
test("long script chunks retain every character in order", () => {
  const script = "第一幕：清晨的街道。\n".repeat(1100);
  const chunks = splitScript(script, 2000);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), script);
  assert.ok(chunks.every((c) => c.length <= 2000));
});
test("invalid model JSON is repaired and locked shots survive replanning", async () => {
  let calls = 0,
    unloaded = false;
  const engine = {
    chat: async () => {
      calls++;
      return calls === 1 ? "这不是JSON" : JSON.stringify(valid());
    },
    unload: async () => {
      unloaded = true;
    },
  };
  const old = valid();
  old.shots[0].locked = true;
  old.shots[0].prompt = "用户手动锁定的镜头";
  const result = await planProject(
    { script: "一只猫在清晨走过街道", style: "写实", plan: old },
    { model: "qwen3:8b" },
    { engine },
  );
  assert.equal(calls, 2);
  assert.equal(
    result.shots.find((s) => s.id === "s1").prompt,
    "用户手动锁定的镜头",
  );
  assert.ok(unloaded);
});
test("exhausted repair attempts fail visibly instead of inventing shots", async () => {
  let calls = 0;
  const engine = {
    chat: async () => {
      calls++;
      return "{}";
    },
    unload: async () => {},
  };
  await assert.rejects(
    planProject(
      { script: "剧本", style: "写实" },
      { model: "qwen3:8b" },
      { engine },
    ),
    /规划失败/,
  );
  assert.equal(calls, 3);
});
test("cloud model tags are rejected before inference", () => {
  const client = new Ollama("http://127.0.0.1:11434");
  assert.throws(() => client.assertLocal("qwen3:cloud"), /云端/);
  assert.doesNotThrow(() => client.assertLocal("someone/model:latest"));
  assert.throws(()=>client.assertLocal("https://example.com/model"),/有效/);
});
