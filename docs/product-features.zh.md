# DragonBoat 产品特性

本文档是 DragonBoat 的产品特性账本。当一个长期的产品能力落地、形态发生变化或成为公开故事的一部分时，请保持此文档的更新。

DragonBoat 正在从一个本地演示工具，演变为一个本地优先的异构代码智能体协作层。以下里程碑按实现顺序排列，而非营销优先级。

## 已实现的里程碑

### 1. 核心协作语义

DragonBoat 从一开始就定义了自己的产品语言，而不是仅仅成为某一个供应商的简单包装器：

- 团队身份 (crew identity)
- 舵手和划手角色 (steerer and rower roles)
- 任务包 (task packets)
- 点对点信箱消息 (peer-to-peer mailbox messages)
- 证据包 (evidence bundles)
- 仅追加本地事件 (append-only local events)
- 指挥甲板回放 (command-deck replay)

早期的文档和 Schema 确立了 Codex、Claude Code、Gemini CLI、OpenCode 以及未来的工具应该作为 DragonBoat 语义的适配器，而不是核心模型本身。

### 2. 本地 Web 指挥甲板

首个可用的交互界面是本地 Web 指挥甲板，而不是打包的桌面应用程序。

目前它暴露了以下内容：

- 会话状态 (session state)
- 团队名单 (crew roster)
- 任务图 (task graph)
- 信箱时间线 (mailbox timeline)
- 证据队列 (evidence queue)
- 智能体日志 (agent logs)
- 事件流 (event stream)
- 回放导出 (replay export)

指挥甲板的设计初衷是一个监控和回放层，而不是 IDE 的替代品。

### 3. 全栈协作演示案例

DragonBoat 包含一个本地全栈演示案例，围绕一个简单的项目协作应用，演练了前端、后端和 QA/Ops 角色。

该演示对于证明以下内容非常有用：

- 特定角色的任务包
- 后端到前端的交接
- 前端到 QA 的交接
- QA 证据返回给舵手
- 可回放的智能体通信历史

此演示仍然是一个试验场，而不是永久的产品边界。

### 4. 智能体关系图谱

指挥甲板现在将团队图谱作为首屏界面的核心。

已实现的行为：

- 来自会话状态的动态舵手和划手节点
- 舵手到划手的命令边
- 划手到划手的对等边
- 保存在本地存储中的可拖拽节点位置
- 边悬停和固定的消息预览
- 舵手历史弹出窗口
- 平滑的贝塞尔曲线边，带来不那么僵硬的工作流体验

这使得 DragonBoat 在视觉上更关注关系、协调和消息流，而不是通用的终端输出。

### 5. 品牌化的指挥甲板视觉系统

当前的 Web 甲板具有 DragonBoat 特有的品牌标识：

- 自定义文字商标资产
- 浅色和深色主题
- Codex 和 Claude 图标资产
- 舵手战鼓图案
- 划手船桨图案
- 水波纹图谱背景
- 深色主题文字商标变体

视觉方向刻意采用本地优先、锐利、具有中国文化底蕴，且足够严肃以应对真实的工程工作。

### 6. 本地会话侧边栏与工作区选择

DragonBoat 现在将每次运行视为一个本地会话。

已实现的行为：

- 会话创建
- 会话删除
- 活动会话选择
- 持久化的运行摘要
- 用于工作区跟踪的原生 macOS 文件夹选择器
- 位于 `.dragonboat/runs/<run_id>/` 下的每会话本地运行目录

这将产品从静态演示页面转向了真正的本地指挥甲板。

### 7. 终端镜像

指挥甲板包含了只读的智能体终端镜像。

已实现的行为：

- 为划手进程提供后端 PTY 托管
- 终端缓冲区回放
- 实时终端抽屉/模态框
- 可拖拽的终端界面
- 每个智能体的 CLI 镜像按钮

第一个实现版本使用了内置的 PTY 路径，而不是外部的 `tmux`、`ttyd` 或 GoTTY。

### 8. 前台 Codex 舵手

DragonBoat 改变了在后台托管 Codex 舵手的方向，转而保留原生的 Codex CLI 体验。

已实现的行为：

- `dragonboat steer`
- 前台 `codex -C <workspace>`
- 通过本地 API 进行会话注册
- 注入 `DRAGONBOAT_RUN_ID`、`DRAGONBOAT_WORKSPACE_ROOT` 和 `DRAGONBOAT_API_URL`
- 对 Codex 模型和工作量变化的终端观察

这让昂贵且作为旗舰的舵手留在了用户已经拥有强大功能的原生 CLI 中，而 DragonBoat 则在周围进行观察和协调。

### 9. 项目工作区引导套件

`dragonboat init` 和 `dragonboat steer` 会在被追踪的工作区内安装一个本地的 `.dragonboat/` 套件。

该套件包括：

- 舵手技能 (steerer skill)
- 划手技能 (rower skill)
- 本地命令参考
- 工作区本地 DragonBoat 垫片 (shim)
- 任务包目录
- 交接目录
- 证据目录
- 托管的 `AGENTS.md` 块

这为前台 Codex 舵手在其所操纵的项目内部提供了一个具体的工具箱和指令集。

### 10. 动态 Claude 划手控制

DragonBoat CLI 和后端现在支持动态的划手生命周期控制。

已实现的命令：

- `dragonboat rower start`
- `dragonboat rower stop`
- `dragonboat message send`
- `dragonboat message broadcast`
- `dragonboat evidence submit`
- `dragonboat config set`

后端托管 Claude Code 划手，并将生命周期变化投影到团队、任务、终端、信箱、证据和会话状态中。

### 11. 隔离的划手工作树

动态划手在 DragonBoat 管理的隔离工作树中运行。

已实现的行为：

- 特定于划手的工作树目录
- 划手启动前的工作区覆盖
- 排除重型/运行时目录
- 将引导套件复制到工作者上下文中
- 划手工作与前台舵手工作区保持隔离

这支持更安全的并行工作和可审查的交接。

### 12. 信箱和证据投影

信箱和证据现在是实时产品界面，而不仅仅是抽象文档。

已实现的行为：

- 会话范围信箱消息的 API 端点
- 广播消息
- 证据提交
- 根据证据投影任务状态
- 根据团队生命周期投影任务状态
- 用于消息传递的终端镜像回显
- 拒绝空白交接

目前的产品期望是：先有证据，再谈完成。

### 13. Claude 路由健康检查

DragonBoat 在启动划手之前会检查 Claude Code 的路由健康状况。

已实现的行为：

- 最简 Claude 路由探测
- 供应商错误捕获
- 在划手完全启动前防止 Token 浪费
- 拦截的划手和任务投影
- 命令输出投影
- 拦截器信箱记录

这防止了不健康的模型/供应商路由默默地消耗工作者的尝试机会。

### 14. 按智能体划分的运行时配置

DragonBoat 存储每次运行的智能体模型和工作量 (effort) 设置。

已实现的行为：

- `.dragonboat/runs/<run_id>/agent-config.json`
- 图节点模型和工作量控制
- 从原生终端状态栏同步 Codex 路由
- 为正在运行的智能体注入实时 PTY 斜杠命令
- 为规范的 Claude 划手注入启动参数

这是用户拥有的模型路由的第一个版本。

### 15. 感知能力的划手路由

DragonBoat 现在根据任务能力路由划手，而不仅仅是基于速度或成本。

已实现的行为：

- `.dragonboat/routing-policy.json`
- `dragonboat route recommend`
- `dragonboat route set`
- 解析任务包中的 `## Route`
- 中文路由提示解析，如 `-划手职责:前端设计/接口对接` 和 `-模型:kimi-k2.6`
- 路由驱动的 Claude 启动模型和工作量
- 路由驱动的健康检查模型和工作量
- 路由决策被记录为 `route.decision.recorded` 事件，包含智能体 ID、角色、模型、工作量、所需能力、原因、后备选项、任务 ID 和来源
- 格式化事件流中的路由决策，以便模型选择在回放/调试界面中可见

当前默认策略：

- `glm-5.1` 用于低成本的文本/代码工作
- `kimi-k2.6` 用于多模态工作，如前端设计、截图审查、UI QA 和视觉判断

这使得 DragonBoat 的模型路由具有可解释性、可审计性，并符合用户对成本的控制。

### 16. 首个团队循环验收门控

DragonBoat 现在为第一个真正的自我迭代运行提供了一个可脚本化的验收门控。

已实现的行为：

- `dragonboat acceptance first-crew-loop --events <events.ndjson>`
- 通过 `DRAGONBOAT_RUN_ID` 进行无参数的活动运行解析
- `--run <run_id>` 和 `--latest` 本地运行解析
- 当旧的服务器进程在内存中有事件但没有按运行的事件文件时，提供本地 API 回退
- JSON 事件记录和 NDJSON 事件解析
- 有序的动态划手注册检查
- 划手任务包检查
- Claude 命令启动检查
- 必需的后端到前端、前端到 QA 以及 QA 到舵手的信箱检查
- 针对必需交接的非空信箱正文检查
- 针对划手发起的信箱交接，提供显式的 `--from` 和 `--task` 指导
- 每个划手的证据提交检查
- 划手停止生命周期检查
- 人类可读的 PASS/FAIL 检查表输出
- 位于 `.dragonboat/runs/<run_id>/` 下的工作区本地会话状态和事件文件
- 引导划手和舵手技能中持久的信箱规则
- 在 `rower start` 期间注入规范的后端/前端/QA 提示词护栏
- 在进程退出时，划手工作树的交接/证据文件同步回被追踪的工作区
- 一个真正的自我迭代运行 `run_2026-05-24T08_53_56Z` 通过了门控，在后端、前端和 QA/Ops 划手提交必需的信箱/证据记录并且舵手显式停止了一个划手之后
- 一个黄金路径单元测试现在验证了验收验证器可以识别出带有生命周期停止的完整的动态后端/前端/QA团队循环

这把首个真正的团队循环里程碑从主观的视觉审查转变成了一个可重复的事件账本门控。

演示 API 现在默认使用工作区本地的按会话事件文件，而不是强迫每个服务器运行进入 `run_demo_web_loop/events.json`；显式的 `DRAGONBOAT_EVENT_RECORD_PATH` 仍然适用于一次性调试。

### 17. 顾问通道 V0

DragonBoat 现在拥有一个最小化的外部顾问通道，用于不应伪装成人类命令的操纵输入。

已实现的行为：

- `dragonboat advisor send --kind advice|research|risk --body <text> [--source <path-or-url>]`
- `dragonboat advisor inbox [--limit <count>]`
- 会话 API 端点 `POST /api/sessions/:runId/advisor`
- 本地事件类型 `advisor.message.sent`
- 信箱投影为 `advisor -> agent_codex`
- 通过信箱时间线和事件流在 UI 中可见
- 无 `human.input.submitted` 事件，也无从 Web 到 Codex 的标准输入注入

这为项目所有者或外部研究智能体提供了一种方式，将建议、研究和风险发送给前台舵手，而不必伪装成用户。

### 18. 信箱/证据护栏 V0

DragonBoat 现在针对规范划手执行第一个产品级协调约束。

已实现的行为：

- `task_backend` 的后端证据被拒绝，直到 `agent_backend -> agent_frontend` 发送非空的 `contract` 信箱消息
- `task_frontend` 的前端证据被拒绝，直到 `agent_frontend -> agent_qa_ops` 发送非空的 `status`、`review` 或 `evidence` 信箱消息
- `task_qa_ops` 的 QA/Ops 证据被拒绝，直到 `agent_qa_ops -> agent_codex` 发送非空的 `evidence` 或 `review` 信箱消息
- 非规范/临时划手不会被强行套用第一版团队循环的护栏形态

这把“划手在声称完成前应进行沟通”从一个提示词约定变成了后端 API 约束。

### 19. 上下文包 V0

DragonBoat 现在拥有第一个独立于供应商的上下文包，用于跨平台适配器交接。

已实现的行为：

- 共享的 `dragonboat.context_bundle.v0` 构建器
- 用于智能体可读分发的 Markdown 格式化器
- 位于 `schemas/v0/context-bundle.schema.json` 的 JSON Schema
- 会话 API 端点 `GET /api/sessions/:runId/context-bundle?agentId=<agentId>&taskId=<taskId>`
- CLI 命令 `dragonboat context bundle --agent <agentId> [--task <taskId>] [--format markdown|json]`
- 接收者身份、任务上下文、团队名单、相关信箱、给舵手的顾问说明、智能体日志、最近事件、证据、约束条件和适配器提示
- 当适配器在任务被完全投影到运行状态之前请求任务时的后备任务上下文
- 更新了引导命令参考以及舵手/划手技能，在跨智能体传递状态时倾向于使用上下文包，而不是复制原始转录副本

这是 DragonBoat 迈向真正适配器层的第一步切实举措。它吸收了上下文转移工具的有用经验，同时保持核心负载基于 DragonBoat 自身的团队/任务/信箱/证据语义。

### 20. 回放启动产物 V0

DragonBoat 的回放导出功能现在有了第一个启动故事层，而不仅仅是展示原始的通信事件。

已实现的行为：

- 回放时间线定位：`DragonBoat 是一个团队协作层，而不是一个智能体包装器。`
- 启动章节包括：舵手、动态划手、模型路由、信箱、证据和验收
- `route.decision.recorded` 事件成为可见的回放阶段，显示模型、工作量和原因
- Remotion 视频渲染了一个章节条，显示哪个协作能力已出现在事件流中
- 引导文案现在将视频构建为团队协作回放，而不是通用的全栈演示
- 回放数据测试验证了启动叙事包括团队协作定位和路由决策

这使得 MP4 导出成为一个产品说明产物：观众应该能够看到谁做了决定，谁执行了操作，选择了什么模型路由，移交了什么，提交了什么证据，以及舵手是如何验收运行的。

### 21. 回放启动验收门控

DragonBoat 现在有一个可脚本化的门控，用于检查回放产物是否包含最低限度的公开启动故事。

已实现的行为：

- `dragonboat acceptance replay-launch --events <events.ndjson> --video <path-to-mp4>`
- 支持与首个团队循环验收相同的方法：`--run`、`--latest` 和活跃的 `DRAGONBOAT_RUN_ID` 事件源解析
- 提供 `--video` 时的可选 MP4 存在性检查
- 验证回放源包含前台舵手、动态 Claude 划手、任务包、路由决策、信箱通信、证据提交和舵手审查
- 验证回放数据依然带有产品定位：`DragonBoat 是一个团队协作层，而不是一个智能体包装器。`
- 验证存在六个启动章节：舵手、动态划手、模型路由、信箱、证据和验收
- 适合前台 Codex 舵手审查或发布检查表自动化的 CLI PASS/FAIL 输出

这把回放从主观的设计产物变成了产品故事的验收门控。

### 22. 团队教训 V0

DragonBoat 现在安装了一个共享的工作区教训文件，以便舵手和划手能够将实际的运行经验带入未来的任务包中。

已实现的行为：

- 引导程序从 `docs/crew-lessons-template.md` 安装 `.dragonboat/crew-lessons.md`
- 仅当缺失时才创建教训文件，因此真实的工作区教训不会被后来的 `dragonboat init` 或 `dragonboat steer` 覆盖
- `dragonboat doctor` 将共享的教训文件视为必需引导套件的一部分
- 托管的 `AGENTS.md` 块告诉舵手在计划前阅读教训，将相关的教训总结到任务包中，并在审查后追加新的教训
- 舵手和划手技能都要求阅读 `.dragonboat/crew-lessons.md`
- `.dragonboat/commands.md` 记录了教训工作流
- 初始模板捕获了第一个来之不易的 UI/UX 教训：前端工作需要实时本地预览、截图证据、操作路径和主工作区可见性证明，然后才能移交给 QA

这把协作改进从口头提醒变成了本地团队的共享、持久的操作记忆。

### 23. 可读划手投影与会话侧边栏 UX 优化

DragonBoat 现在将划手的审计数据与指挥甲板中默认的划手阅读体验分离开来。

已实现的行为：

- 原始的 `command.output`、终端缓冲区和事件账本记录保持完整以供审计和回放
- 共享的可读投影助手从 Claude 的 stream-json 派生出面向用户的划手输出，而无需将原始 JSON 解析推入 React 组件
- 默认的划手输出面板现在倾向于使用基础的 Markdown 渲染以及独立的最终总结部分来显示可读的助手内容
- 工具使用、工具结果、用量、会话元数据以及类似的流噪音在原始/调试界面中仍然可用，而不会主导默认视图
- 左侧的会话侧边栏现在支持折叠/展开、悬停元数据工具提示以及折叠后的图谱重新居中
- React 测试覆盖了可读输出的默认行为以及会话工具提示和折叠交互

这将指挥甲板推向更接近舵手在审查期间真正需要的内容：每个划手在做什么、完成了什么、是否受阻以及产生了什么总结，同时仍然保留底层的证据轨迹。

### 24. 舵手看门狗 V0

DragonBoat 现在挂载了一个仓库本地的 Codex Stop 钩子，以便在划手完成工作后唤醒前台 Codex 舵手。

已实现的行为：

- `dragonboat init` 和 `dragonboat steer` 在被追踪的工作区安装 `.codex/hooks.json`
- 该钩子调用 `.dragonboat/bin/dragonboat watchdog stop-check`
- `watchdog stop-check` 读取本地的 `.dragonboat/runs/<run_id>/events.ndjson` 和 `.dragonboat/runs/<run_id>/watchdog-state.json`
- 看门狗不需要本地 Web/API 服务器可达即可做出 Stop-hook 决策
- 发给 `agent_codex` 的新信箱消息、拦截器信箱、划手证据和划手生命周期 `done|blocked|stopped` 均可触发 Codex 继续运行
- 通过 `stop_hook_active`、挂起签名和看门狗游标状态来抑制重复的过时挂起窗口
- 每次继续运行都会向本地事件账本写入 `watchdog.continuation.recorded`
- `dragonboat steer` 现在恢复可用时相同工作区的正在运行的会话，以便重启前台 Codex CLI 能够保留活跃的 DragonBoat 运行上下文
- `dragonboat doctor` 验证是否安装了仓库本地的 Stop 钩子

这弥补了在自我使用中发现的一个真实产品差距：前台舵手不应该必须等待人类的下一个提示词才能注意到划手已经提交了证据或完成了工作。

### 25. 委派经济学 V0

DragonBoat 现在有了一个首发产品机制，用于决定任务是否应该成为智能体团队任务。

已实现的行为：

- `dragonboat delegate assess` 评估上下文摊销、并行拆分、接口稳定性、验收可执行性、低成本划手适配度、共享状态惩罚和运行时漂移惩罚
- 即便数值评分很高，硬拦截器也会强制使用 `single_agent_default`
- `dragonboat delegate packet` 生成一个密封的 Markdown 任务包，包含适配度快照、密封的输入、允许的范围、验收检查、证据要求和升级规则
- `dragonboat evidence submit` 保持向后兼容，同时接受结构化的证明字段，例如文件、修改路径、命令、工作区证明、风险、截图和任务类型
- `dragonboat evidence gate` 检查提交的证据是否实际上可被审查，包括信箱先于证据、验收证明、追踪工作区可见性、风险披露以及特定于任务的 UI/运行时/后端契约规则
- `dragonboat benchmark record` 从事件账本中得出本地运行的经济指标，并写入 `.dragonboat/benchmarks/<benchmark_id>.json`
- `dragonboat benchmark compare` 比较单体运行和团队运行记录的溢价 Token 比例、挂钟时间、错误完成计数和结果
- 新的事件类型使工作流可审计：`delegation.fit.assessed`、`sealed.task_packet.created`、`evidence.gate.checked` 和 `benchmark.recorded`
- 文档和引导技能现在指示舵手，当任务适配度低或无法密封时避免启动团队

这使得 DragonBoat 从“启动更多的智能体”转变为“仅在经济学和验证契约证明协调成本合理时才启动划手”。

### 26. 团队任务契约与监督循环 V0

DragonBoat 现在针对多划手工作制定了首个协调协议，多划手工作应当表现得像一个团队，而不是几个孤立的员工。

已实现的行为：

- 密封的任务包可以包含一个 `Crew Mission Contract`（团队任务契约）
- 任务契约字段涵盖了共享任务、最终合成负责人、角色立场、非目标、所需的同伴以及意图确认
- `intent_confirmed` 信箱类型记录了划手在开展实质性工作前理解了共享任务
- `peer_challenge` 信箱类型记录了跨划手的质疑或针对多视角任务的对齐情况
- `dragonboat supervise wait` 允许前台舵手等待划手的里程碑，例如意图确认、状态和证据
- 监督结果会写入 `supervision.wait.completed`、`supervision.wait.timeout` 或 `supervision.wait.blocked` 事件
- 舵手和划手技能现在明确指出 Stop-hook 看门狗不是实时监督
- 团队教训现在警告并行审查需要共享任务和同伴挑战

这解决了一个从自我使用中发现的具体失败问题：如果不这样，并行审查团队可能会在没有共享合成、同伴异议或实时纠正的情况下产生三份本地报告。DragonBoat 现在有了一个最低限度的协议，让划手们确认目的、挑战同伴，并在团队仍然活跃时保持舵手的清醒。

### 27. 用户级 DragonBoat 命令垫片 (Command Shim)

DragonBoat 现在针对任意项目工作区拥有了首个用户级入口。

已实现的行为：

- `dragonboat install-command` 将命令垫片安装到选定的目标路径，例如 `/opt/homebrew/bin/dragonboat`
- 该垫片委托给当前的 DragonBoat CLI 入口，而无需目标项目包含 `./bin/dragonboat.mjs`
- 安装完成后，所有者可以在任何工作区目录中运行 `dragonboat init`、`dragonboat doctor` 和 `dragonboat steer`
- 项目引导程序仍然会为舵手和划手任务包安装工作区本地的 `.dragonboat/bin/dragonboat` 垫片
- CLI 用法和引导命令参考现在记录了全局命令路径和本地后备选项

这弥补了一个实际的易用性差距：DragonBoat 应该跟随用户进入项目文件夹，而不是强迫项目文件夹知道 DragonBoat 仓库位于何处。

## 当前已知差距

DragonBoat 不应过度夸大当前状态。

- 第一个真正的自我迭代运行已经通过，但在将其视为稳定版本之前，应在全新的工作区中重复这一过程。
- 舵手看门狗 V0 已挂载并可以发出继续决策，但它仍然需要在具有真正 Codex 钩子执行的新会话中进行验证，而不仅仅是手动的 `watchdog stop-check` 冒烟测试。
- 委派经济学 V0 优先使用 CLI；指挥甲板尚未在视觉上汇总适配度分数、门控结果或基准比较。
- 团队监督 V0 优先使用 CLI/事件账本；指挥甲板尚未将监督等待状态或缺失的里程碑警告显示为专用面板。
- 顾问到舵手的通信现在作为一个最小的辅助通道存在，但仍需要更丰富的 UI 功能和舵手工作流强化。
- 信箱/证据合规性现在有了第一个规范的 API 护栏，但仍需要期望跟踪、更丰富的错误恢复，以及针对异常工作流的强制/覆盖语义。
- 上下文包 V0 已存在，但除 Codex 引导 Claude Code 之外，针对特定供应商的导入/导出适配器仍处于早期阶段。
- 回放启动产物 V0 有了首个验收门控，但在将其用作公开启动材料之前，仍应针对真实导出的 MP4 进行视觉审查。
- 团队教训 V0 作为一个可变的工作区文件存在，但它仍依赖于舵手在每次真实运行后追加简明的教训。
- 用户级命令垫片当前指向本地开发工作树；后续打包应将其替换为 npm/Homebrew 风格的安装故事。

## 要保留的产品优势

- 本地优先的编排。
- 优先采用跨平台语义，而非供应商特定适配器。
- 尊重原生的 CLI，而不是取代用户的智能体工具。
- 动态的团队规模，而不是固定的一加三模板。
- 将同伴信箱和证据作为头等产品概念。
- 用于原生前台 CLI 工作流的舵手看门狗接续。
- 用于决定何时真正值得使用智能体团队的委派经济学。
- 用户级的 `dragonboat` 命令，使得任意文件夹都能成为 DragonBoat 工作区，无需相对于仓库的路径。
- 共享的任务契约和实时监督，使多划手工作更像一个团队。
- 由用户控制的感知能力的模型路由。
- 视觉回放和指挥甲板可观察性。
- 具有开源国际影响力的中国文化身份。

## 建议的下一阶段功能方向

### 1. 可重复的首个团队循环加固

首个完整的、真实的 DragonBoat 自我迭代运行已成功通过一次。下一个可靠性目标是使该结果无需人工干预即可重复。

加固的路径应继续证明：

- 前台 Codex 舵手起草一份团队计划
- 用户确认该计划
- 后端划手动态启动
- 后端提交契约交接和证据
- 前端划手仅在需要时启动
- 前端使用后端交接并提交状态/证据
- QA/Ops 划手验证并提交最终证据
- 舵手停止至少一个划手
- Web 图谱、终端镜像、信箱、任务图和证据队列均与实际情况一致

这在增加更多功能之前，仍然是最重要的可靠性领域。

### 2. 顾问通道加固

为外部顾问智能体建立的第一个显式通道现已存在。接下来，需要对其进行强化，使前台舵手能够自然地使用它，而不会将其与人类意图相混淆。

顾问应该能够：

- 向舵手发送产品洞察
- 附加源链接和研究笔记
- 推荐下一个任务包
- 标记路由选择或缺失的证据
- 请求舵手在需要时向用户寻求确认

该通道现在在信箱/事件界面中可见并记录在事件日志中；下一步是使其更加符合人体工程学和更易于审查。

### 3. 顾问研究流水线

将产品研究变成一个可审计的产物。

顾问应定期或手动生成：

- 市场笔记
- 竞争对手差异
- 功能机会
- 推荐的 DragonBoat 迭代提示词
- 风险提示

这应输入到顾问通道中，而不是绕过舵手。

### 4. 更强的信箱护栏

应该让跳过划手协调变得更加困难。

潜在的实现方式：

- 任务包所需的交接检查表
- 信箱期望跟踪器
- 缺失交接警告
- 在必需消息存在之前不能接受证据
- 在缺失必需证据时拦截划手停止操作，除非被显式强制执行

这把“请沟通”变成了一个可强制执行的工作流。

### 5. 供应商适配器层

使用上下文包 V0 作为公共负载，同时规范不同基于 CLI 的智能体的适配器边界。

近期目标：

- Claude Code 钩子和子智能体生命周期事件
- Codex 前台会话观察和顾问注入
- Gemini CLI 或 Antigravity 风格的子智能体语义
- 稍后的 OpenCode/OpenClaw 风格的命令适配器

DragonBoat 在适配器不同的情况下，应保持相同的团队/任务/信箱/证据语义。

### 6. 作为启动产物的回放

让回放导出功能足够好，以用于公开解释 DragonBoat。

一个强大的回放应展示：

- 团队计划
- 动态划手创建
- 模型路由决策
- 智能体之间的信箱消息
- 证据检查点
- 舵手验收
- 最终的“已交付内容”总结

这不仅仅是润色。这是用户理解 DragonBoat 为什么不是另一个智能体包装器的方式。

## 下一阶段方向背后的外部信号

最近的智能体产品正在向专用的智能体、钩子、工作树隔离和显式的生命周期事件收敛：

- Claude Code 支持自定义子智能体、子智能体生命周期钩子和项目级钩子事件。
- Gemini CLI 记录了具有独立上下文窗口和工具作用域的专家子智能体。
- Vibe Kanban 强调并行的编码智能体、隔离的工作树、代码审查和对话可靠性。
- Codex 和 AGENTS.md 参考资料强调了指令文件、可重复配置和项目本地智能体上下文的重要性。
- 最近对 Claude Code 的研究认为，智能体系统的大部分价值存在于模型循环周围：权限、压缩、可扩展性、子智能体、工作树和面向追加的会话存储。
- 最近关于“过度热情”的研究表明，宽容的编码智能体可能会在作用域之外行动，这使得 DragonBoat 的计划确认、信箱、证据以及停止/验收门控在战略上显得尤为重要。

产品含义很明确：DragonBoat 不应通过仅仅启动更多的智能体来竞争。它应该通过使异构智能体工作可观察、受限、可路由、可审查和可回放来取胜。

代表性参考资料：

- Anthropic Claude Code 子智能体: https://docs.anthropic.com/en/docs/claude-code/sub-agents
- Anthropic Claude Code 钩子: https://docs.anthropic.com/en/docs/claude-code/hooks
- Gemini CLI 子智能体: https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md
- Vibe Kanban 工作区: https://vibe-kb.com/docs/workspaces/
- OpenAI Codex 工作流示例: https://cookbook.openai.com/examples/codex/codex_mcp_agents_sdk/building_consistent_workflows_codex_cli_agents_sdk
- “过度热情的编码智能体”研究: https://arxiv.org/abs/2605.18583