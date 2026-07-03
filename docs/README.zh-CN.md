# DragonBoat 中文说明

[返回首页](../README.md) | [English Guide](README.en.md)

DragonBoat 是一个本地优先的多 Agent 协调层。

它的核心想法很简单：一个主 Agent 负责理解全局、制定计划、做最终判断；几个辅助 Agent 负责执行边界清晰的小任务，并把可审查的结果交回来。

## 一句话理解

今天的大模型写代码已经很强，但一旦变成“团队协作”，问题马上出现：

- 上下文靠手工复制
- 谁该做什么不清楚
- 进度很难看见
- Agent 之间的交接很随意
- 最终结果是否真的可用，往往只能靠猜

DragonBoat 的目标不是再造一个聊天窗口，而是把这些协作动作变成用户自己可见、可控、可复核的本地流程。

## 一次运行会发生什么

1. 你在项目目录里用 `dragonboat steer` 启动前台主 Agent。
2. 主 Agent 判断这件事要不要拆给多个辅助 Agent。
3. 如果值得拆，DragonBoat 会在隔离 worktree 里拉起辅助 Agent，并把整个过程投影到本地浏览器面板里。

浏览器面板不是新的 Agent，它只是让你看见这次协作到底发生了什么。

## 浏览器面板里能看到什么

- **Agent 关系图**：谁是主 Agent，当前有哪些辅助 Agent，它们之间有没有在交流。
- **Agent 聊天和交接记录**：问题、阻塞、状态更新、交接说明，用可读对话的形式展示出来。
- **可读输出**：先看每个 Agent 的简明总结，需要时再看原始终端输出。
- **完成证明**：命令、diff、测试结果、截图、风险说明，这些都是判断“是不是真的做完了”的依据。

## 术语翻译成人话

- **Steerer / 主 Agent**：读完整个任务、做计划、拍板是否验收的那个 Agent。
- **Rower / 辅助 Agent**：只拿一个边界明确的小任务去执行的 Agent。
- **Task packet / 任务包**：发给辅助 Agent 的任务说明，告诉它做什么、不要做什么、怎样算完成。
- **Mailbox / 消息箱**：Agent 之间的消息流。你看到的就是聊天、提问、阻塞和交接记录。
- **Evidence / 完成证明**：用来判断工作是否真的可接受的材料，比如命令、测试、diff、截图和风险说明。
- **Command deck / 命令面板**：本地浏览器里的总览面板，用来看这次协作过程。

## 60 秒上手

先启动本地浏览器面板：

```bash
npm i -g dragonboat-crew
dragonboat deck --open
```

再开第二个终端，进入你要工作的项目：

```bash
cd your-project
dragonboat steer --open
```

把下面这段提示词贴给前台 Codex CLI：

```text
Read .dragonboat/skills/dragonboat-steerer.md and .dragonboat/crew-lessons.md.
Assess whether this task should use DragonBoat.
If it is crew-fit, draft a crew plan first and wait for my confirmation.
If I approve, create sealed task packets, start the rowers, monitor intent_confirmed/status/evidence, and summarize only reviewable results.
```

## 什么时候适合用

适合：

- 前端、后端、QA 可以并行推进的任务
- 需要多视角调研、交叉验证、互相质疑的任务
- 迁移、审计、梳理代码库这类适合拆开的任务
- 一个 Agent 看页面，一个 Agent 看代码或接口合同的视觉/浏览器任务

不太适合：

- 很小的修改
- 目标还很模糊、需要大量产品判断的任务
- 实时运行状态变化太快、很难稳定交接的排障场景

## 为什么它重要

DragonBoat 的价值不在“Agent 数量更多”，而在：

- 让昂贵的全局理解尽量只做一次
- 把可拆分的工作交给更便宜或更专长的辅助 Agent
- 让你事后能回答：这次多 Agent 协作到底省了时间，还是只是增加了协调成本

## 发布前检查

```bash
dragonboat release check
dragonboat doctor
dragonboat doctor --deep --model kimi-k2.6 --effort max
dragonboat smoke run
dragonboat acceptance smoke --latest
dragonboat acceptance first-crew-loop --latest
```

仓库开发时还应运行：

```bash
npm run demo:test
npm run demo:build
git diff --check
```

## 界面截图

首次打开、还没有任何会话时的引导页：

![DragonBoat empty onboarding screen with the terminal command for launching Codex](assets/dragonboat-empty-onboarding.png)

Agent 聊天、辅助 Agent 输出和完成证明队列：

![DragonBoat Agents group chat and Agent output panels](assets/dragonboat-smoke-group-chat-output.png)

## 继续阅读

- [愿景文档](vision.md)
- [核心概念](concepts.md)
- [数据契约](v0.1-data-contracts.md)
- [Codex CLI 适配边界](adapters/codex-cli.md)
- [Claude Code CLI 适配边界](adapters/claude-code-cli.md)
- [模型路由](model-routing.md)
- [安全与隐私](security-and-privacy.md)
- [发布检查清单](release-checklist.md)
