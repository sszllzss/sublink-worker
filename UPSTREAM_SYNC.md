# 上游兼容修复同步记录

同步日期：2026-10-25。

- 自定义分支基准：`8cae1ac5a660190f01262d634c7ab87e1bc2b969`，版本 `102.4.8`。
- 上游同步目标：`7Sageer/sublink-worker@acc2a06ddc9a5c79d60a176aaaa8377813ebf67b`，2026-10-16。
- 共同祖先：`1cde4a1ef2b03db84b2a04f8999c3344ce6b71dc`。
- 本次仅同步源码，不包含新版本发布或部署。

## 同步内容

- 官方 sing-box 使用内联订阅节点，清理不受支持的 provider 字段，保留完整配置覆盖与策略组设置。
- sing-box 1.11 / 1.12 / 1.14 的 DNS 引导解析、回退、DIRECT 模式、UDP、旧版特殊出站及规则集下载兼容修复。
- Hysteria2 跳跃端口、参数别名及 sing-box 端口/时长/带宽字段转换。
- AnyTLS 默认端口、参数别名、URI 解析及 sing-box Duration 字符串转换。
- Clash provider 国家分组、空组校验、稳定 provider 名称、重复节点及自定义规则选择项修复。
- Xray 订阅流量响应头、远程订阅格式及 Base64 解码改进。
- 自定义规则 site/ip 标识过滤、按输出格式读取基础配置、TTL=0 和内存 KV 长期限修复。
- 同步必要的依赖锁文件、Vitest 4 / Workers 测试配置、Node 22 CI 和 Docker 构建修复；移除上游已弃用的 pnpm 锁文件。

## 自定义功能的合并处理

- 保留账号、聚合管理页面、KV 数据结构、定时刷新、优选 IP 分组、来源策略组和分享 URI。
- 保留 VLESS XHTTP、下载设置、指纹、ALPN、节点前缀和跨来源同配置节点。
- 保留机场独立 User-Agent、名称识别及 Node HTTP 请求回退。
- 自定义规则使用上游的完整节点选择项，并继续包含聚合器来源组；sing-box 使用路由拒绝动作，不引用已移除的 REJECT 出站。
- 聚合输出应用与普通端点相同的基础配置格式隔离规则。
- sing-box 输出清除聚合内部元数据及 VLESS URI 的 security 字段；该字段经官方内核确认属于未知字段。
- 保留自定义版本号、镜像仓库和本地 Compose 构建方式。

## 验证

- 完整 Vitest：41 个文件、339 项测试通过，包含新增的聚合输出、来源组、账号、格式隔离和规则标识回归。
- Vercel 构建通过。
- Node.js 构建通过。
- Cloudflare Workers `wrangler deploy --dry-run` 通过，未上传或部署。
- 官方 sing-box 1.11.15、1.12.0、1.14.0：配置检查及本地回环 DNS/路由测试通过。1.11 测试 12 项，1.12 和 1.14 各 13 项；AnyTLS 仅在后两个版本校验。
- 原生测试夹具同时监听 IPv4/IPv6 回环地址，与其 DNS 同时返回 A/AAAA 记录的行为一致。

测试使用本地回环代理和 DNS，不切换系统代理、不使用真实机场凭据。测试主机 Node.js 为 24.19.0；项目 CI 采用上游的 Node 22 配置。未执行真实机场连通性测试或 Docker 容器运行测试。

复现单元测试和构建：

```sh
npm ci
npm test
npm run build
npm run build:node
npx wrangler deploy --dry-run
```

原生回归需安装官方 sing-box 并指定 `SING_BOX_BINARY`，随后运行：

```sh
node --test scripts/check-singbox-dns.mjs
```
