import type { CaptureTarget } from "./types.js";

export const DEFAULT_ANALYSIS_QUESTION =
  "请识别这道算法题，提取题意与约束，给出解题思路、复杂度分析和可直接提交的完整代码。如果题面不清楚，明确写出不确定点。";

export const DEFAULT_ANALYSIS_PROMPT_TEMPLATE = `你是一个算法题屏幕解析与求解助手。

请按顺序完成：
1. 识别当前屏幕是否是一道算法题，并判断平台或代码环境，例如 LeetCode、力扣、牛客、Codeforces、编辑器或题解页面。
2. 尽量提取完整题意，包括输入输出要求、样例、数据范围、函数签名、限制条件和可见提示。
3. 在 key_points 里总结解题所需的核心信息，例如约束、边界条件、关键观察或适用算法。
4. 在 answer 里直接给出可用于做题的结果，必须包含：题意重述、算法思路、时间复杂度、空间复杂度、完整代码。
5. 如果能从屏幕判断代码语言或平台格式要求，就按该要求输出；如果无法判断，默认输出 C++17 风格的可提交代码。
6. next_actions 最多给 3 条，优先给自测建议、边界用例或需要用户补充的缺失信息。
7. 如果图片关键信息不可见、不完整或有歧义，必须写入 uncertainties，不要编造约束或样例。

输出要求：
- 只输出符合 JSON Schema 的 JSON。
- key_points、ocr_text、next_actions、uncertainties 必须是字符串数组。
- 如果看不到可读文字，ocr_text 返回空数组，不要编造。
- answer 必须包含算法思路和完整代码，代码要可直接复制使用。

上下文：
- 前台应用：{{frontmostApp}}
- 窗口标题：{{windowTitle}}
- 捕获模式：{{captureTarget}}
- 用户问题：{{question}}`;

const PROMPT_VARIABLE_PATTERN = /\{\{\s*(frontmostApp|windowTitle|captureTarget|question)\s*\}\}/g;

export function renderAnalysisPromptTemplate(
  template: string,
  input: {
    question: string;
    captureTarget: CaptureTarget;
    frontmostApp?: string | null;
    windowTitle?: string | null;
  }
): string {
  const normalizedQuestion = input.question.trim() ? input.question.trim() : DEFAULT_ANALYSIS_QUESTION;
  const values = {
    frontmostApp: input.frontmostApp ?? "未知",
    windowTitle: input.windowTitle ?? "未知",
    captureTarget: input.captureTarget,
    question: normalizedQuestion
  } satisfies Record<"frontmostApp" | "windowTitle" | "captureTarget" | "question", string>;

  return template.replace(PROMPT_VARIABLE_PATTERN, (_match, key: keyof typeof values) => values[key]);
}

export function buildAnalysisPrompt(
  input: {
    question: string;
    captureTarget: CaptureTarget;
    frontmostApp?: string | null;
    windowTitle?: string | null;
  },
  promptTemplate = DEFAULT_ANALYSIS_PROMPT_TEMPLATE
): string {
  return renderAnalysisPromptTemplate(promptTemplate, input);
}
