# Domain Docs

本仓库使用单一上下文：根目录 `GLOSSARY.md` 作为领域词汇表，架构决策记录放在 `docs/adr/`。`packages/core` 和 `packages/babel` 共用这套领域文档。

## Before exploring, read these

- 探索代码或编写工单、规格、测试与重构建议前，读取根目录 [GLOSSARY.md](../../GLOSSARY.md)。
- 讨论或修改架构时，读取 `docs/adr/` 中与当前工作相关的决策记录。
- 若相关领域文档尚不存在，直接继续；由 `domain-modeling` 在实际形成术语或决策时按需创建。空的 ADR 目录无需提前建立。

## Use the glossary's vocabulary

输出中涉及领域概念时，采用 `GLOSSARY.md` 中的术语及含义，并遵守其中的 `_Avoid_` 提示。

遇到词汇表未覆盖的概念，先核对是否已有适用术语；确有缺口时交由 `domain-modeling` 补充。

## Flag ADR conflicts

方案与已有 ADR 冲突时，明确指出对应 ADR 及重新讨论的理由，再记录新的决策。
