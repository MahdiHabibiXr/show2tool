<p align="center">
  <img src="../../assets/banner.svg" alt="Show2Tool — 演示、参数化、验证" width="100%" />
</p>

<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README.fa.md">فارسی</a> ·
  <a href="README.ar.md">العربية</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#quick-start">快速开始</a> ·
  <a href="#how-it-works">工作原理</a> ·
  <a href="#built-vs-planned">已实现与计划中</a> ·
  <a href="#safety-model">安全模型</a> ·
  <a href="#roadmap">路线图</a>
</p>

<p align="center">
  <img alt="阶段：可行性原型" src="https://img.shields.io/badge/stage-feasibility_prototype-277a99?style=flat-square" />
  <img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-426c51?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square" />
  <img alt="本地优先" src="https://img.shields.io/badge/local--first-no_hosted_service-526576?style=flat-square" />
</p>

## 将演示转化为可验证的结果

**Show2Tool 探索一个简单的想法：演示浏览器工作流，识别其输入，再用一个未见过的示例验证结果。**

当前原型从隔离的 Chrome 会话中捕获 API 流量，推断简单的输入绑定，并针对合成应用进行重放。它还测试了受限创建／更新操作的一次性批准，以及通过回读进行的验证。

更长期的目标是提供本地技能和 CLI，以导出可复用的 CLI/MCP 工具。**这条导出流水线尚未实现。** 面向智能体优先使用的 alpha 版本正在构建中，目前尚不可用。

> [!IMPORTANT]
> **这是研究原型，不是生产级自动化工具。** 仅支持本地合成测试环境。请勿将此探索性原型用于真实账户。目前没有 npm 发行版，也没有可安装的 MCP 服务器。

<a id="quick-start"></a>

## 快速开始

**环境要求：** Node.js 24+、npm 和 Google Chrome。目前实际测试的平台是 Windows；其中一项 CDP 集成测试使用 Chrome 在 Windows 上的标准安装路径。

```sh
git clone https://github.com/MahdiHabibiXr/show2tool.git
cd show2tool
npm ci --ignore-scripts
npm run demo
```

演示会打开一个隔离的临时 Chrome 配置文件，以**无头模式（headless）**运行，演示两次搜索，再验证第三次搜索。它不会访问你日常使用的 Chrome 配置文件，也不需要模型 API 密钥。

### 成功运行时的输出

```json
{
  "status": "passed",
  "scope": "synthetic fixture only",
  "trainingInputs": ["alpha", "beta"],
  "heldOutInput": "gamma",
  "resultIds": ["a3"],
  "writes": 0,
  "captureRows": 2
}
```

*以上是演示输出中的部分字段。耗时、字节数和契约哈希因运行而异。这不是性能基准测试。*

### 保留并检查证据

```sh
# Choose a directory that does not exist yet.
npm run demo -- --out my-new-evidence

# Group captured endpoints without returning approved scalar values.
npm run cli -- inspect my-new-evidence/recording.json

# Inspect the parameter mapping learned from annotated demonstrations.
npm run cli -- infer my-new-evidence/demonstrations.json
```

保存的产物包含合成录制数据、带注释的演示和结果报告，并不是导出的可执行工具。现有证据绝不会被覆盖。

<a id="how-it-works"></a>

## 工作原理

```text
  两次演示                     本地处理                       留出输入验证
 ┌───────────────────┐       ┌────────────────────┐       ┌──────────────────┐
 │ 搜索 alpha        │       │ 限定 API 流量范围  │       │ 搜索 gamma       │
 │ 搜索 beta         │ ────▶ │ 推断 q → query     │ ────▶ │ 预期记录 a3      │
 └───────────────────┘       │ 冻结契约           │       │ 检查实际效果     │
                             └────────────────────┘       └──────────────────┘
```

1. **观察，而非重放。** 限定于所选主框架的 CDP 捕获会记录演示中的请求，不会额外发出写入请求。
2. **保持证据精简。** 默认采用以结构为先的摘要。查询参数／请求体中的标量值需要显式加入允许列表。
3. **拒绝歧义。** 多个匹配的输入或没有变化的示例，不能算作已泛化的绑定。
4. **测试新输入。** 测试环境中独立初始化的数据提供预期结果。
5. **单独处理写入。** 写入需要一个有有效期、仅可使用一次的意图，并且绑定到目标、租户和所提议的精确变更。

仅有 HTTP 200 和有效的 JSON 结构还不够：测试还会检查选中的记录、租户、更新版本和实际效果。

<a id="built-vs-planned"></a>

## 已实现与计划中

| 能力 | 当前状态 |
| :--- | :--- |
| 隔离的 Chrome + CDP 捕获 | **已实现并在本地实际测试** |
| 主框架范围、时长和保留限制 | **已实现**，带有明确的不完整标记 |
| 根据两次演示推断查询参数和创建字段的标量绑定 | **已针对合成测试环境实现** |
| 未见输入重放与搜索 → 详情依赖 | **已针对合成测试环境实现** |
| 绑定目标的创建／更新意图与回读 | **已实现并测试**，使用注入的批准适配器 |
| 变更提交后进程终止 → 结果未知，不再发送 | **已使用独立的效果计数器测试** |
| 精简的 `inspect` 命令与面向带注释演示的 `infer` 命令 | **已实现** |
| 终端人工确认 | 辅助功能已提供；**真人操作验证待完成** |
| 通用网站工作流编译器 | **计划中** |
| 可移植的可执行 CLI/MCP 导出 | **计划中** |
| 跨进程确认代理与公开技能 | **计划中** |

<a id="safety-model"></a>

## 安全模型

### 默认本地运行

- 没有托管服务、内嵌模型循环或单独的 AI API 密钥。
- 使用临时配置文件；不复制浏览器 Cookie 数据库或你日常使用的 Chrome 配置文件。
- 重放仅限于同一进程中注册的合成源站。
- 用于检测泄露的诱饵凭据是测试数据，不是真实服务的凭据。

### 显式效果

- 录制不会重放演示中的写入。
- 写入意图会过期且只能消耗一次；目标与租户必须匹配。
- 带版本控制的更新与回读用于核实实际发生的情况。
- 确认回执丢失或发送中断时，结果记为**未知**，绝不自动重试。
- 不自动回滚：补偿操作将是一次单独的写入。

### 如实说明边界

这些检查用于预防意外，**并非针对同一用户下不受限制进程的操作系统级隔离**。CDP 可能在应用检查前缓冲数据；保留限制并不是对 Chrome 全部内存或网络数据接收量的硬性上限。按键名过滤无法识别所有秘密信息或个人信息字段。

付款、删除、权限变更、批量操作、真实账户自动化以及向外部发送／发布内容，均不在当前原型的范围内。

## 尝试人工确认探针

请在真正的交互式终端中运行：

```sh
npm run probe:manual
```

它会显示目标、租户以及精确的合成创建操作。输入提示要求的 `approve <intent-id>` 短语，即可创建**一个临时测试任务**；输入其他任何内容都会拒绝操作。非交互式输入会在测试环境启动前被拒绝。

自动化的批准适配器测试不能替代真人运行。这项可行性验证仍未完成。

## 开发

```sh
npm run typecheck
npm test
```

测试覆盖浏览器范围、存在歧义的映射、租户／认证失败、语义不匹配、受限分页、批准复用、gzip 解压膨胀、JSON 深度、响应停滞，以及发送前后真实的子进程终止。

> [!NOTE]
> 已观察到并发发送测试间歇性失败，目前尚未查明根因。通过的运行只能作为对应运行的证据，不能保证已达到生产可用标准。

<details>
<summary><strong>仓库结构</strong></summary>

```text
spike/
  capture.ts         限定范围的 CDP 观察与保留限制
  infer.ts           候选绑定与歧义检测
  replay.ts          仅用于测试环境的传输与读取工作流
  intents.ts         绑定目标的修改意图
  journal.ts         持久化发送状态与恢复
  approve.ts         本地确认适配器
  inspect.ts         精简的录制摘要
  cli.ts             inspect / infer 命令入口
  demo.ts            可运行的合成读取流水线
  manual.ts          交互式合成写入探针
  fixture/           本地应用与独立的效果状态
test/
  spike/             单元、集成和浏览器探针
  helpers/           真实进程崩溃测试工作进程
assets/
  banner.svg         仓库横幅
```

</details>

## 与 CLI-Anything 的区别

[CLI-Anything](https://github.com/HKUDS/CLI-Anything) 从软件代码库或现有 API 构建适合智能体使用的命令行接口。Show2Tool 则从**演示产生的浏览器／API 流量**入手，研究参数泛化、显式写入确认和独立的结果检查。

这两个项目都希望让智能体能够使用软件，但并非同一实现，Show2Tool 也不捆绑 CLI-Anything。这一区别是一项产品假设，并非声称其他项目缺乏验证。

<a id="roadmap"></a>

## 路线图

- [x] 合成浏览器捕获 → 推断 → 未见输入重放
- [x] 捕获的创建演示 → 获批的合成写入 → 回读
- [x] 精简证据检查与崩溃结果探针
- [ ] 完成可行性关卡：真人确认与竞品运行
- [ ] 将经过审查的工作流契约和运行时通用化
- [ ] 添加跨进程人工批准代理
- [ ] 从同一运行时导出可检查的 CLI 和 MCP 包
- [ ] 将创作技能打包，并在全新的智能体会话中测试
- [ ] 发布兼容性结果和可复现的基准测试

## 贡献

欢迎提供聚焦问题的复现：有歧义的输入映射、缺失的省略标记、错误的结果或隐私保护退化。请使用合成数据，并报告命令、环境、预期结果和实际结果。切勿附上 Cookie、浏览器配置文件或真实账户的原始流量。

**目前尚未选定开源许可证。** 源代码可见不等于授予再分发权。许可证与公开发布的打包方式仍有待决定。
