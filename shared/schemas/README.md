# Schemas

这个目录放结构化输出 schema。

当前文件：

- [codex-output.schema.json](/Users/oyzh/interview/shared/schemas/codex-output.schema.json)

当前输出字段固定为：

- `summary`
- `key_points`
- `ocr_text`
- `answer`
- `next_actions`
- `uncertainties`

无论是 `Codex`、`LM Studio` 还是 `Ollama`，都要返回与这个 schema 对齐的 JSON。
