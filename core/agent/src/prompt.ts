import type { CaptureTarget } from "./types.js";

export function buildAnalysisPrompt(input: {
  question: string;
  captureTarget: CaptureTarget;
  frontmostApp?: string | null;
  windowTitle?: string | null;
}): string {
  const normalizedQuestion = input.question.trim()
    ? input.question.trim()
    : "请直接总结当前屏幕内容，并指出现在最值得用户关注的信息。";

  return [
    "你是一个 Mac 屏幕图像解析助手。",
    "",
    "请按顺序完成：",
    "1. 识别当前屏幕所属的应用或任务场景。",
    "2. 总结当前屏幕最重要的 3 个区域或信息块。",
    "3. 提取可见的错误、标题、按钮、代码、表格或警告。",
    "4. 回答用户问题。",
    "5. 给出不超过 3 条下一步建议。",
    "6. 如果图片关键信息不可见或不清晰，必须写入 uncertainties。",
    "",
    "输出要求：",
    "- 只输出符合 JSON Schema 的 JSON。",
    "- key_points、ocr_text、next_actions、uncertainties 必须是字符串数组。",
    "- 如果看不到可读文字，ocr_text 返回空数组，不要编造。",
    "",
    "上下文：",
    `- 前台应用：${input.frontmostApp ?? "未知"}`,
    `- 窗口标题：${input.windowTitle ?? "未知"}`,
    `- 捕获模式：${input.captureTarget}`,
    `- 用户问题：${normalizedQuestion}`
  ].join("\n");
}
