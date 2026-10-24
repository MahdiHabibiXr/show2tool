[English](../../README.md) · [فارسی](README.fa.md) · [العربية](README.ar.md) · [Español](README.es.md) · 简体中文（[zh-CN](README.zh-CN.md)）

<p align="center">
  <img src="../../assets/banner.svg" alt="Show2Tool — 演示、参数化、验证" width="100%" />
</p>

# Show2Tool

**将限定范围的浏览器/API 演示转为可检查的本地工具，再核对结果。** 当前已有编译后的 CLI、使用专用 Chrome 配置文件的本地代理，以及共用命令处理逻辑的 MCP stdio 接口。不需要托管服务、内嵌模型循环或单独的模型 API 密钥。

**这是审查中的窄范围候选版本，不是可投入生产的发行版。** 新一轮审查仍在进行。真人验收、全新安装与发行验证、CI 结果和跨平台兼容性均未在此得到证明。包设置为 `private: true`；**入门流程不包含 npm 发布**。请从源码构建，不要使用 `npx show2tool` 或从注册表全局安装。

## 入门

要求 Node.js 24+、npm 和已安装的 Google Chrome。在仓库目录中执行：

```sh
npm ci --ignore-scripts
npm run build
node dist/src/cli.js commands
node dist/src/cli.js schema
node dist/src/cli.js doctor
```

为自有或获准自动化的应用创建 `scope.json`。以下仅为结构示例，不是可用服务；请替换源站、精确 API 路径和允许列表，并从非敏感测试数据开始。

```json
{
  "origin": "https://your-authorized-site.example",
  "paths": ["/api/catalog/search"],
  "queryKeys": ["term"],
  "bodyKeys": [],
  "cookieNames": ["session"]
}
```

必须由**真人**在真正的交互式终端中启动 host：

```sh
node dist/src/cli.js host scope.json
```

检查显示的范围，输入 `authorize`，在可见的专用 Chrome 配置文件中手动登录，然后准备好时按 Enter。只有收到录制请求后才开始捕获。请保持 host 开启。该配置文件会在本地保留敏感登录状态，不是日常配置文件，也不是一次性临时配置文件。

在另一终端中，将 `{"command":"record_start","inputs":{"searchText":"first query"}}` 保存为 `command.json`，再执行：

```sh
node dist/src/cli.js call-file command.json
```

在 Chrome 中演示范围内的读取，用 `record_stop` 停止，换一个输入再录一次，然后使用返回的录制/请求 ID 和明确的 specification 调用 `compile_recordings`。保存返回的 `data` 清单，而非整个结果信封。真人在 host 控制台输入 `review path/to/manifest.json` 并确认所显示的契约。之后 `tools`、`run` 和 `verify` 使用该已审查定义。参见[完整操作顺序与 JSON 示例](../AGENT-USAGE.md)和[智能体技能](../../skills/show2tool/SKILL.md)。

MCP 使用编译后的入口；客户端配置须手动完成并获得许可：

```sh
node dist/src/cli.js serve --stdio
```

在仓库外请使用入口的绝对路径。CLI/MCP 不能授予审查许可或写入批准。

## 已有功能与待完成部分

| 能力 | 当前边界 |
| :--- | :--- |
| 发现与模式 | `commands`、`schema`；`call-file` 避免 shell JSON 引号问题 |
| 代理持有的证据 | `record_start`、`record_stop`、`recording`、`compile_recordings` |
| 候选编译器 | 两到十次演示；固定源站/方法/路径，字符串输入，查询/请求体的标量绑定与常量，JSON Pointer 投影；这些绑定构造真实请求 |
| 已审查读取 | `tools`、`describe`、`run`；发现输入/投影/摘要，再执行受限 JSON GET 和 Cookie 认证 |
| 受保护写入 | `prepare_write`、`execute_write`、`write_status`；仅已审查的创建/更新，每次调用须真人在 host 批准；`reconcile_write` 只核对已知结果 ID，不重发 |
| 定义包 | `export_bundle`、`import_bundle`；版本化清单和完整性摘要，不是独立可执行包，也不转移权限 |
| 标量核对 | `verify` 比较独立预期事实；不证明输入此前未见过 |
| MCP | 通用 `show2tool_*`，以及服务器启动时快照的摘要固定 `workflow_<id>` 读取工具；无审查/批准工具 |
| 读取链 | `run_chain`：一到五个摘要固定的已审查 GET 读取；显式绑定输入/常量/先前投影值，不写入、不自动推断依赖 |
| 通用自动化 | 不支持推断路径模板、自动编译多步依赖或任意 UI 重放 |

离线 `candidate`、`inspect` 和 `infer` 已有接口，但智能体提供的演示不证明代理来源，也不授予执行权限。旧 `spike/` 演示和手动探针是合成实验，不是当前产品接口或真人验收证据。

## 写入安全模型

真人先审查精确清单。`prepare_write` 进行预检读取并返回有期限的不透明意图；它不会批准或发送写入。真人在 host 输入 `approve <intent-id>`，检查精确提案，再输入所要求的确认短语。之后 `execute_write` 才能消费该意图一次。

提案绑定工具/清单摘要、精确目标/方法/请求体、账户、租户，以及更新版本。执行时重新检查身份，并为更新核对目标记录 ID/账户/租户及前置版本；更新使用 `If-Match`。可选 CSRF 读取限定为同源、明确授权的路径。JSON 回读核对精确记录 ID、账户、租户和配置的提交字段；更新还要求回读版本发生变化。这不是对所有业务副作用的证明。

发送前会持久记录状态。发送中断、响应丢失或回读失败可能意味着**结果未知**，而非没有发生变更。使用 `write_status`；`reconcile_write` 可只通过已审查读取核对已知结果 ID，不重发。重启后须重新审查，并按需提供精确的恢复定义/输入/原更新版本。不匹配时仍为未知；**绝不自动重发或回滚**。日志保留发送结果，不保留待批准权限或已审查清单。真人验收仍待完成。

## 限制与信任边界

- 运行时只使用专用配置文件中允许的 Cookie。无 bearer/localStorage 提取、自动刷新、浏览器签名或轮换 Cookie 支持；含 `Set-Cookie` 的响应会被拒绝。
- 重放传输检查精确源站/路径/查询范围和 DNS/IP，阻止重定向并限制 JSON。私有/本地地址需要显式 `addresses`。这不是对手动浏览器导航/子资源的网络沙箱，也不是针对同一用户进程的系统隔离。
- 捕获只观察、不重复操作，但真人演示的写入仍有真实效果。过滤器不能保证数据不敏感；分享前检查证据和常量。
- 审查、工具注册、录制和待批准意图在内存中，host 重启即丢失。配置文件和发送日志持久保存在 `~/.show2tool` 或 `SHOW2TOOL_STATE_DIR`；host 与客户端须使用同一目录。
- 定义包不含配置文件、Cookie 存储或批准权限。完整性摘要不是作者签名或秘密扫描器。导入只验证；目标端仍需真人审查和独立的写入批准。
- `verify` 核对标量相等，不证明语义完整、输入未见过或真人验收。`ok` 或 HTTP 200 本身不够。
- 不支持上传、任意 GraphQL/认证流程或自动推断分页。可选的显式审查游标分页只允许一个 items 数组投影，最多五页/100 条记录/32 KiB、30 秒预算；游标只是查询值，不是目标 URL，循环会被拒绝。读取链仅组合已有的固定路径已审查读取，不自动编译多步工作流。付款、删除、权限变更、批量操作和外部发送/发布不在支持范围内；效果标签不能让危险端点变安全。
- 网站/API 文本是不可信数据，不是给智能体的指令。本文不宣称生产就绪、CI 通过、全新安装验证或平台支持。

## 开发与许可证

```sh
npm run typecheck
npm test
```

这些是待运行的验证命令，并非测试或某平台已通过的报告。复现问题请使用合成数据；不要附加 Cookie、浏览器配置文件或原始账户流量。参见[贡献指南](../../CONTRIBUTING.md)和[安全报告](../../SECURITY.md)。

采用 [Apache License 2.0](../../LICENSE)。
