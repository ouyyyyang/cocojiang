import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalysisPrompt,
  DEFAULT_ANALYSIS_PROMPT_TEMPLATE,
  renderAnalysisPromptTemplate
} from "../src/prompt.js";

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

  assert.match(prompt, /请识别这道算法题/);
  assert.match(prompt, /完整代码/);
});

test("renderAnalysisPromptTemplate replaces supported placeholders", () => {
  const prompt = renderAnalysisPromptTemplate("App={{frontmostApp}} Title={{windowTitle}} Q={{question}}", {
    question: "两数之和",
    captureTarget: "main_display",
    frontmostApp: "Safari",
    windowTitle: "LeetCode"
  });

  assert.equal(prompt, "App=Safari Title=LeetCode Q=两数之和");
});

test("default template keeps algorithm solving instructions", () => {
  assert.match(DEFAULT_ANALYSIS_PROMPT_TEMPLATE, /完整代码/);
  assert.match(DEFAULT_ANALYSIS_PROMPT_TEMPLATE, /\{\{question\}\}/);
});
