# Issue tracker: GitHub

本仓库的规格、工单、依赖和进度统一记录在 [XLCYun/nl.js 的 GitHub Issues](https://github.com/XLCYun/nl.js/issues)，通过 `gh` CLI 操作。长期设计说明保留在 `docs/design/`，并引用对应工单；临时工单草稿放在仓库之外。

## Conventions

- **创建工单**：`gh issue create --repo XLCYun/nl.js --title "..." --body-file <正文文件>`。
- **读取工单**：`gh issue view <number> --repo XLCYun/nl.js --json number,title,body,labels,comments`；更新前读取完整正文和讨论。
- **列出工单**：`gh issue list --repo XLCYun/nl.js --state open --json number,title,body,labels,comments,assignees`，按需要增加 `--label`、`--search` 和 `--limit`。全量处理时使用分页 API，避免只读取默认的首批结果。
- **更新正文**：`gh issue edit <number> --repo XLCYun/nl.js --body-file <正文文件>`，保留仍有效的已有内容。
- **添加评论**：`gh issue comment <number> --repo XLCYun/nl.js --body-file <评论文件>`。
- **添加／移除标签**：`gh issue edit <number> --repo XLCYun/nl.js --add-label "..."` 或 `--remove-label "..."`。工作流角色见 [triage-labels.md](triage-labels.md)。
- **关闭工单**：先记录交付结果与验证证据，再执行 `gh issue close <number> --repo XLCYun/nl.js`。

多行正文和评论先写入临时文件，再通过 `--body-file` 传递，保留真实换行。

## Sub-issues and dependencies

先创建工单取得真实编号，再建立父子关系和依赖。

- **取得数据库 ID**：`gh api repos/XLCYun/nl.js/issues/<number> --jq .id`。关系 API 使用数字数据库 ID，而不是工单编号或 `node_id`。
- **设置子工单**：`gh api --method POST repos/XLCYun/nl.js/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`。
- **设置阻塞关系**：`gh api --method POST repos/XLCYun/nl.js/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`。
- **读取子工单**：`gh api --paginate repos/XLCYun/nl.js/issues/<parent>/sub_issues`。
- **读取阻塞关系**：`gh api --paginate repos/XLCYun/nl.js/issues/<child>/dependencies/blocked_by`；只要仍有未关闭的 blocker，该工单就未就绪。工单响应中的 `issue_dependencies_summary.blocked_by` 是尚未关闭的 blocker 数量。

仅在 GitHub 关系功能不可用时，使用正文表达关系：子工单顶部写 `Part of #<parent>`，父工单用任务列表链接子工单；阻塞工单顶部写 `Blocked by: #<n>, #<n>`。工单仍保存在 GitHub Issues。

## Pull requests as a triage surface

**PRs as a request surface: no.**

如果以后显式改为 `yes`，外部 PR 使用同一套分诊角色，通过 `gh pr view <number> --comments`、`gh pr diff <number>`、`gh pr edit`、`gh pr comment` 和 `gh pr close` 操作，均指定 `--repo XLCYun/nl.js`。

GitHub 的 issue 和 PR 共用编号空间。遇到来源不明的 `#<number>`，先尝试 `gh pr view`，再用 `gh issue view` 解析。

## When a skill says "publish to the issue tracker"

创建 GitHub issue；相关技能按自身规则设置工作流标签。发布成功后用实际 issue URL 作为上下文引用。

## When a skill says "fetch the relevant ticket"

按上述读取命令取得工单正文、标签和评论。

## Wayfinding operations

供 `/wayfinder` 使用：任务图对应一个父 issue，决策工单对应其子 issues。

- **Map**：父 issue 使用 `wayfinder:map` 标签，正文保留 Notes、Decisions-so-far 和 Fog 等任务图信息。
- **Child ticket**：建立 GitHub 子工单关系，使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task` 标签。Wayfinding 工单采用这套标签；标签缺失时按实际需要创建。
- **Blocking**：优先使用上面的原生依赖 API；仅在功能不可用时采用正文关系。
- **Frontier**：读取任务图的全部子工单，筛选未关闭、没有未关闭 blocker、尚未分配负责人者，按任务图顺序领取首个就绪工单。
- **Claim**：开始工作时先执行 `gh issue edit <number> --repo XLCYun/nl.js --add-assignee @me`。
- **Resolve**：向工单写入结论与证据，关闭工单，再在父任务图的 Decisions-so-far 中追加简述及工单链接。
