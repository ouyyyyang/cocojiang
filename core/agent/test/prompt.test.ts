import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisPrompt } from "../src/prompt.js";

test("buildAnalysisPrompt includes user question when provided", () => {
  const prompt = buildAnalysisPrompt({
    question: "这个报错是什么？",
    captureTarget: "main_display",
    frontmostApp: "Terminal",
    windowTitle: "build.log"
  });

  assert.match(prompt, /用户问题：这个报错是什么？/);
  assert.match(prompt, /前台应用：Terminal/);
  assert.match(prompt, /窗口标题：build\.log/);
});

test("buildAnalysisPrompt falls back when question is empty", () => {
  const prompt = buildAnalysisPrompt({
    question: "   ",
    captureTarget: "main_display"
  });

  assert.match(prompt, /请直接总结当前屏幕内容/);
});
