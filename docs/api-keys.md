# API Key 清单

实际的 key 填在项目根目录的 `.env` 文件里（已被 .gitignore 忽略，**不会**提交到 git）。
本文档只说明每个 key 的用途、获取方式和状态，可以安全提交。

## 状态总览

| # | 能力 | 服务商 | 环境变量 | 状态 |
|---|------|--------|----------|------|
| 1 | 视觉理解 + 文本推理 | 火山方舟 · 豆包 | `ARK_API_KEY` | ✅ 已配置 |
| 2 | ASR 语音识别 | 火山引擎 | `VOLC_ASR_APP_ID` / `VOLC_ASR_ACCESS_TOKEN` / `VOLC_ASR_SECRET_KEY` | ✅ 已配置 |
| 3 | TTS 语音合成 | 火山引擎 | `VOLC_TTS_APP_ID` / `VOLC_TTS_ACCESS_TOKEN` / `VOLC_TTS_SECRET_KEY` | ✅ 已配置 |
| 4 | 联网搜索 | 博查 / Tavily / Serper 任选 | `SEARCH_API_KEY` | ⬜ 待补充（MVP 可缓）|
| 5 | 微信小程序凭证 | 微信公众平台 | `WX_APPID` / `WX_APP_SECRET` | ✅ 已配置 |

> **语音方案（2026-06-12 已定）**：v1 用「录音 → ASR → 推理 → TTS」管线；豆包**实时语音交互**模型（端到端语音对话，约 0.1 元/轮，WebSocket 流式接入，同一个 ARK key 可调）留作 v1.x「费曼讲解」环节的体验升级，不在 MVP 范围。

## 各项说明

### 1. 视觉理解 + 文本推理（已配置）

- **模型**：`doubao-seed-2-0-pro-260215`（多模态，支持图片输入 + 深度推理）
- **接口**：`POST https://ark.cn-beijing.volces.com/api/v3/responses`，Bearer 鉴权
- **承担**：错题图片分析/OCR、AI 解题给标准答案（spec 7.6）、费曼追问、错因归因、同类题生成——满足 spec 7.4 的「图片分析」硬性要求
- 控制台：https://console.volcengine.com/ark

### 2. ASR 语音识别（待补充）

- **用途**：孩子全程语音操作的入口——讲解、复述题意、报答案、起名（spec 7.2）
- **推荐火山引擎**（与豆包同一个账号，计费统一）：控制台 → 语音技术 → 语音识别，创建应用后获得 App ID 和 Access Token
- **备选/兜底**：微信「同声传译」插件，小程序端免费可用、无需 key，但音色与准确率一般，可作 v1 起步方案——如果先用插件，这两个变量可以暂时留空

### 3. TTS 语音合成（待补充）

- **用途**：朗读题目和 AI 小伙伴的追问，照顾低年级识字量（spec 7.2）
- **推荐火山引擎**：控制台 → 语音技术 → 语音合成，选童声/亲和类音色；同样可先用微信同声传译插件兜底

### 4. 联网搜索（待补充）

- **用途**：本地题库覆盖不足时，联网搜同类题作补充（spec 7.3）
- **候选**（任选其一，填 `SEARCH_API_KEY`）：
  - 博查 Bocha（https://open.bochaai.com，国内、中文搜索质量好）
  - Tavily（https://tavily.com）
  - Serper（https://serper.dev）
- MVP 阶段可暂缓——v1 同类题以 AI 生成为主（spec 15.4），这个 key 优先级最低

### 5. 微信小程序凭证（待补充）

- **用途**：后端换取登录态（code2session）、内容安全检查（msgSecCheck，未成年人产品必须）、后续订阅消息
- **获取**：https://mp.weixin.qq.com → 注册个人主体小程序 → 开发 → 开发管理 → 开发设置 → AppID / AppSecret
- 注意：AppSecret 重置后旧值立即失效，妥善保存

## 安全注意事项

- `.env` 永远不进 git；新机器迁移时单独拷贝。
- 任何 key 如果曾在聊天、截图、文档中暴露过，建议在控制台**重置/轮换**一次。
- 小程序端代码**不直接持有任何 key**：所有模型调用走自己的后端转发，key 只存在于服务端环境。
