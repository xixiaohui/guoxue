# Poetry Gateway API 文档

> 本文档供 **Flutter / Web / 小程序** 客户端开发使用。
> 所有接口返回统一 JSON 格式，支持 CORS 跨域。

## 基础信息

| 项目 | 值 |
|------|-----|
| 生产环境 | `https://www.chinesepoetry.space` |
| 开发环境 | `http://localhost:3000` |
| 统一前缀 | `/api/v1` |
| 认证方式 | `Authorization: Bearer <jwt_token>` |
| Content-Type | `application/json` |

## 统一响应格式

```json
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "success": false, "code": "ERROR_CODE", "message": "错误描述" }
```

### 错误码

| HTTP | code | 说明 |
|------|------|------|
| 400 | `VALIDATION_ERROR` | 参数校验失败 |
| 401 | `UNAUTHORIZED` | 未登录或 Token 过期 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL_ERROR` | 服务器内部错误 |
| 502 | `UPSTREAM_ERROR` | 上游服务不可用 |

---

## ⚠️ 生产环境实测勘误（2026-08-17 实测）

> 以下差异以 **生产环境实际行为为准**，客户端按此适配。下文各端点处有对应 ⚠️ 标注。

| 端点 | 文档描述 | 实测行为 | 客户端建议 |
|------|----------|----------|-----------|
| `/poems` 筛选 | 支持 `dynasty`/`type`/`author` | ❌ **筛选参数全部被忽略**，始终返回未筛选列表 | 需要筛选时用 `/poems/random`（唯一支持筛选的端点） |
| `/poems` 分页元数据 | 返回 `total`/`page`/`pageSize` | ❌ 仅返回 `data.poems`；但 `page`/`pageSize` 请求参数**生效** | 用"返回条数 < pageSize"判断到底 |
| `/poems/:id` | 返回诗词详情 | ❌ **HTTP 500 空响应**（多个 id 实测均失败） | 列表页务必带 seed 跳转；详情页需错误兜底 |
| `/poems/random` | 支持筛选 | ✅ `dynasty`/`type` 筛选**真实生效**；⚠️ 但**零匹配筛选值直接 500**（而非空结果）：type=唐诗/五言古诗/七言古诗、dynasty=隋/两汉/南北朝/金/明 均实测 500 | 筛选浏览场景的数据源；全批 500 时应提示"分类暂不可用"而非"网络错误"；「唐诗」客户端映射为 dynasty=唐 |
| `/home` | 返回 `totalPoems`/`totalAuthors` | ❌ 仅返回 `featuredPoem` + `featuredAuthor` | 统计数据用 `/categories` 汇总兜底 |
| `/authors` 列表 | id 为 int，返回分页元数据 | ⚠️ **id 是字符串**；`description`/`poemCount` 可为 null；无分页元数据但 `page` 参数生效 | id 解析容错（String→int） |
| `/authors/:id` | 返回完整作者对象 | ⚠️ **仅返回 `dynasty`/`description`/`poemCount`**，缺 `id`/`name` | 跳转时携带 seed（name/dynasty）补齐 |
| `/search` | 返回 `total` 分页元数据 | ⚠️ 仅返回 `poems` + `query`；`page` 参数生效 | 用"返回条数 < pageSize"判断到底 |
| `/discover` | dynasties/types 为数组 | ⚠️ dynasties/types 包裹为 `{"data": [...]}`；recentPoems 为普通数组（10 条） | 解析兼容两种格式 |
| `/categories` | 所有朝代+体裁 | ⚠️ 同样包裹 `{"data": [...]}`；朝代含 `poem_count`/`author_count`/`start_year` 等富字段 | 可用于统计汇总 |
| `/stats/reading` | 返回热门排行 | ⚠️ 结构正确，但**当前数据全为 0/空数组**（无阅读记录） | UI 需优雅处理空数据（隐藏区块） |
| `/recommend` | 随机推荐 | ✅ 正常，实测 **5 首/批** + `reason` | 适合做无限推荐流 |
| `/quote` `/solar-term` `/config` | — | ✅ 与文档一致 | — |

---

## 1. 聚合接口

### `GET /api/v1/home`

首页聚合：推荐诗词 + 推荐作者 + 统计数据。

**无需认证**

> ⚠️ **实测（2026-08）：响应不含 `totalPoems`/`totalAuthors`**，仅有 `featuredPoem` + `featuredAuthor`。
> 统计数据请改用 `/categories` 的 `poem_count`/`author_count` 汇总。

```dart
// Flutter 示例
final res = await http.get(Uri.parse('$baseUrl/api/v1/home'));
final json = jsonDecode(res.body);
if (json['success']) {
  final poem = json['data']['featuredPoem'];
  final author = json['data']['featuredAuthor'];
  final totalPoems = json['data']['totalPoems'];
  final totalAuthors = json['data']['totalAuthors'];
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "featuredPoem": {
      "id": 1, "title": "静夜思", "content": "床前明月光...",
      "author": "李白", "dynasty": "唐", "type": "五言绝句"
    },
    "featuredAuthor": {
      "id": 1, "name": "李白", "dynasty": "唐",
      "description": "字太白...", "poemCount": 896
    },
    "totalPoems": 385000,
    "totalAuthors": 14000
  }
}
```

---

### `GET /api/v1/discover`

发现页：近期诗词 + 朝代列表 + 体裁列表。

**无需认证**

> ⚠️ **实测（2026-08）：`dynasties`/`types` 实际包裹一层 `{"data": [...]}`**；
> `recentPoems` 为普通数组（10 条）。解析需兼容两种格式。

```json
{
  "success": true,
  "data": {
    "recentPoems": [{ "id": 1, "title": "...", ... }],
    "dynasties": [{ "id": 1, "name": "唐" }, { "id": 2, "name": "宋" }],
    "types": [{ "id": 1, "name": "五言绝句" }, { "id": 2, "name": "七言律诗" }]
  }
}
```

---

### `GET /api/v1/categories`

分类聚合：所有朝代 + 所有体裁（缓存 1 小时）。

**无需认证**

> ⚠️ **实测（2026-08）**：同样包裹 `{"data": [...]}`；且朝代对象比文档更丰富，含统计字段：

```json
{
  "success": true,
  "data": {
    "dynasties": {
      "data": [
        { "id": 6, "name": "唐", "name_en": "Tang", "start_year": 618, "end_year": 907,
          "poem_count": 337874, "author_count": 11843 }
      ]
    },
    "types": {
      "data": [
        { "id": 99, "name": "其他", "category": "其他", "description": "...", "poem_count": 93527 }
      ]
    }
  }
}
```

> 实测汇总：11 个朝代共 **371,313 首诗 / 13,577 位作者**；17 个体裁。
> `poem_count`/`author_count` 可兜底 `/home` 缺失的统计数据。

---

### `GET /api/v1/recommend`

为你推荐 — 随机翻页 + 多样化推荐理由。

**无需认证**

> ✅ 实测（2026-08）：每次调用返回 **5 首诗 + 1 条 `reason`**，随机翻页可能重复（客户端按 id 去重）。
> 无分页参数，每次调用即一批——适合"触底再调一次"的无限推荐流。

```json
{
  "success": true,
  "data": {
    "poems": [{ "id": 42, "title": "...", ... }],
    "reason": "经典永流传"
  }
}
```

---

### `GET /api/v1/quote`

每日一句 — 同一天返回相同诗句（缓存至次日），适合 App 开屏。

**无需认证**

```json
{
  "success": true,
  "data": {
    "content": "床前明月光，疑是地上霜",
    "author": "李白",
    "source": "静夜思",
    "date": "2026-07-23"
  }
}
```

---

### `GET /api/v1/solar-term`

节气推荐 — 根据当前 24 节气推荐应景诗词（缓存 6 小时）。

**无需认证**

```json
{
  "success": true,
  "data": {
    "termName": "大暑",
    "termDescription": "炎热至极，一年中最热时期，荷花盛开",
    "poem": { "id": 42, "title": "...", "content": "...", "author": "...", "dynasty": "...", "type": "..." },
    "reason": "今日大暑，为你精选一首夏季诗词"
  }
}
```

---

### `GET /api/v1/config`

客户端配置：版本号、Banner 列表、功能开关（缓存 1 小时）。

**无需认证**

```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "banners": [
      {
        "id": "spring",
        "imageUrl": "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=1200&h=400&fit=crop",
        "title": "春日诗词鉴赏",
        "link": "/browse?dynasty=唐",
        "sort": 1
      }
    ],
    "features": {
      "aiAnalysis": true,
      "aiAsk": true,
      "aiTranslate": true,
      "favorites": true,
      "readingHistory": true,
      "recommendations": true,
      "solarTerm": true,
      "dailyQuote": true
    }
  }
}
```

---

## 2. 诗词接口

### `GET /api/v1/poems`

诗词列表，支持分页和筛选。

**无需认证**

> ❌ **实测（2026-08）：`dynasty`/`type`/`author` 筛选参数全部被忽略**，始终返回未筛选的全量列表。
> `page`/`pageSize` 分页参数**生效**，但响应**不含 `total`/`page`/`pageSize`**，仅有 `data.poems`。
>
> 客户端适配：需要筛选请用 `GET /poems/random`（筛选真实生效）；"是否到底"用"返回条数 < pageSize"判断。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | int | 否 | 页码，默认 1 |
| `pageSize` | int | 否 | 每页数量，默认 20，最大 100 |
| `dynasty` | string | 否 | 朝代筛选，如 "唐" |
| `type` | string | 否 | 体裁筛选，如 "五言绝句" |
| `author` | string | 否 | 作者筛选，如 "李白" |

```dart
// Flutter 示例
final res = await http.get(Uri.parse(
  '$baseUrl/api/v1/poems?page=1&pageSize=15&dynasty=唐&type=五言绝句'
));
```

```json
{
  "success": true,
  "data": {
    "poems": [
      { "id": 1, "title": "静夜思", "content": "床前明月光...", "author": "李白", "dynasty": "唐", "type": "五言绝句" }
    ],
    "total": 18895,
    "page": 1,
    "pageSize": 15
  }
}
```

---

### `GET /api/v1/poems/:id`

诗词详情。

**无需认证**

> ❌ **实测（2026-08）：此端点故障，多个 id 均返回 HTTP 500 空响应。**
> 客户端必须以列表页带入的 seed 数据渲染详情，API 失败时优雅降级。

```dart
final res = await http.get(Uri.parse('$baseUrl/api/v1/poems/1'));
```

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "静夜思",
    "content": "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
    "author": "李白",
    "dynasty": "唐",
    "type": "五言绝句"
  }
}
```

---

### `GET /api/v1/poems/random`

随机获取一首诗词，支持飞花令场景。

**无需认证**

> ✅ **实测（2026-08）：`dynasty`/`type` 筛选真实生效**（每次返回 1 首）。
> 这是目前**唯一支持筛选的诗词端点**——分类浏览页应以此并发请求多首构建列表。
>
> ⚠️ **零匹配筛选值直接 HTTP 500**（而非空结果）。实测 500 的值：
>
> - type：`唐诗`、`五言古诗`、`七言古诗`（别名 五古/七古/古体诗 同样 500）
> - dynasty：`隋`、`两汉`、`南北朝`、`金`、`明`
>
> 可用的 type：`其他`/`七言绝句`/`七言律诗`/`五言律诗`/`宋词`/`五言绝句`/`元曲`/`乐府诗`/`诗经`/`楚辞`/`四书五经`；
> 可用的 dynasty：`唐`/`宋`/`元`/`五代`/`先秦`/`其他`/`魏晋`/`清`。
> 客户端适配：整批请求全部 500 时判定"分类暂不可用"（区别于断网/超时）；「唐诗」可映射为 `dynasty=唐`。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `author` | string | 否 | 作者筛选 |
| `type` | string | 否 | 体裁筛选 |
| `dynasty` | string | 否 | 朝代筛选 |
| `char` | string | 否 | 包含指定字（飞花令） |

```dart
final res = await http.get(Uri.parse(
  '$baseUrl/api/v1/poems/random?author=李白&char=月'
));
```

---

## 3. 作者接口

### `GET /api/v1/authors`

作者列表。

**无需认证**

> ⚠️ **实测（2026-08）**：`id` 为**字符串**（如 `"7133"`）；`description`/`poemCount` 可能为 null；
> 响应仅含 `authors` 数组（无分页元数据），但 `page` 参数生效。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | int | 否 | 页码，默认 1 |
| `pageSize` | int | 否 | 每页数量，默认 20 |

```json
{
  "success": true,
  "data": {
    "authors": [
      { "id": 1, "name": "李白", "dynasty": "唐", "description": "字太白...", "poemCount": 896 }
    ],
    "total": 14000,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### `GET /api/v1/authors/:id`

作者详情。

**无需认证**

> ⚠️ **实测（2026-08）：响应仅含 `dynasty`/`description`/`poemCount`，不含 `id` 与 `name`。**
> 客户端跳转作者页时应携带 seed（至少 name/dynasty）以补齐展示。

```json
{
  "success": true,
  "data": {
    "id": 1, "name": "李白", "dynasty": "唐",
    "description": "字太白，号青莲居士...",
    "poemCount": 896
  }
}
```

---

## 4. 搜索接口

### `GET /api/v1/search`

全文搜索诗词。

**无需认证**

> ⚠️ **实测（2026-08）**：响应仅含 `poems` + `query`（**无 `total`**）；`page`/`pageSize` 分页参数生效。
> "是否到底"用"返回条数 < pageSize"判断。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | string | **是** | 搜索关键词 |
| `type` | string | 否 | 搜索类型：`all` / `title` / `content` / `author`，默认 all |
| `page` | int | 否 | 页码，默认 1 |
| `pageSize` | int | 否 | 每页数量，默认 20 |

```dart
final res = await http.get(Uri.parse(
  '$baseUrl/api/v1/search?q=静夜思&type=title'
));
```

```json
{
  "success": true,
  "data": {
    "poems": [{ "id": 1, "title": "静夜思", "content": "...", "author": "李白", ... }],
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "query": "静夜思"
  }
}
```

---

## 5. AI 接口 🔒

> **注意：** AI 接口全部需要认证，且有频率限制（5 次/分钟）。

### Flutter 认证封装

```dart
class ApiClient {
  static const baseUrl = 'https://www.chinesepoetry.space';
  String? _token;

  Future<void> login(String email, String password) async { ... }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    final json = jsonDecode(res.body);
    if (json['success'] != true) throw ApiException(json['code'], json['message']);
    return json['data'];
  }
}
```

### `POST /api/v1/ai/analyse`

AI 诗词赏析 — 返回创作背景、赏析、关键词、情感分析。

**🔒 需认证 | ⏱ 限流 5次/分钟**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | **是** | 诗词标题 |
| `content` | string | **是** | 诗词正文 |
| `author` | string | 否 | 作者 |
| `dynasty` | string | 否 | 朝代 |

```dart
final data = await apiClient.post('/api/v1/ai/analyse', {
  'title': '静夜思',
  'content': '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
  'author': '李白',
  'dynasty': '唐',
});
// data['background'] — 创作背景
// data['appreciation'] — 赏析
// data['keywords'] — 关键词数组
// data['emotions'] — 情感数组
```

```json
{
  "success": true,
  "data": {
    "background": "李白在扬州旅舍所作...",
    "appreciation": "此诗以明白如话的语言...",
    "keywords": ["思乡", "明月", "孤独"],
    "emotions": ["思乡之情", "孤寂之感"]
  }
}
```

---

### `POST /api/v1/ai/ask`

AI 诗词问答 — 自由提问古诗词相关问题。

**🔒 需认证 | ⏱ 限流 5次/分钟**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | **是** | 问题 |
| `context` | string | 否 | 参考诗词内容 |

```dart
final data = await apiClient.post('/api/v1/ai/ask', {
  'question': '李白和杜甫的风格有什么不同？',
});
// data['answer'] — AI 回答
```

```json
{
  "success": true,
  "data": {
    "answer": "李白与杜甫是唐代诗坛的双子星座..."
  }
}
```

---

### `POST /api/v1/ai/translate`

AI 诗词翻译 — 支持英/日/韩三种语言。

**🔒 需认证 | ⏱ 限流 5次/分钟**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | **是** | 诗词内容 |
| `targetLang` | string | 否 | 目标语言：`en` / `ja` / `ko`，默认 en |

```dart
final data = await apiClient.post('/api/v1/ai/translate', {
  'content': '床前明月光，疑是地上霜',
  'targetLang': 'en',
});
// data['translation'] — 译文
// data['notes'] — 典故解释列表
```

```json
{
  "success": true,
  "data": {
    "translation": "Moonlight before my bed, perhaps frost on the ground.",
    "notes": ["床：指井栏或坐具，非现代意义的床"]
  }
}
```

---

## 6. 用户接口

### `POST /api/v1/user/register`

用户注册，成功后返回 JWT Token。

**无需认证**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | **是** | 邮箱 |
| `password` | string | **是** | 密码，最少 6 位 |
| `name` | string | 否 | 昵称 |

```dart
final data = await ApiClient.post('/api/v1/user/register', {
  'email': 'user@example.com',
  'password': '123456',
  'name': '诗词爱好者',
});
// 保存 data['token'] 到本地存储
await prefs.setString('auth_token', data['token']);
```

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "诗词爱好者",
      "avatar": null,
      "createdAt": "2026-07-23T00:00:00.000Z"
    }
  }
}
```

---

### `POST /api/v1/user/login`

用户登录，返回 JWT Token（有效期 7 天）。

**无需认证**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | string | **是** | 邮箱 |
| `password` | string | **是** | 密码 |

```dart
// Flutter 完整登录流程
Future<String> login(String email, String password) async {
  final res = await http.post(
    Uri.parse('$baseUrl/api/v1/user/login'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': email, 'password': password}),
  );
  final json = jsonDecode(res.body);
  if (json['success'] != true) throw Exception(json['message']);
  return json['data']['token'];
}
```

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "诗词爱好者",
      "avatar": null,
      "createdAt": "2026-07-23T00:00:00.000Z"
    }
  }
}
```

---

### `GET /api/v1/user/profile`

获取当前用户信息。

**🔒 需认证**

```dart
final res = await http.get(
  Uri.parse('$baseUrl/api/v1/user/profile'),
  headers: {'Authorization': 'Bearer $token'},
);
```

---

### `PUT /api/v1/user/profile`

更新用户信息（昵称、头像）。

**🔒 需认证**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 新昵称 |
| `avatar` | string | 否 | 头像 URL |

---

## 7. 收藏接口 🔒

### `GET /api/v1/favorites`

获取收藏列表。

**🔒 需认证**

```json
{
  "success": true,
  "data": {
    "favorites": [
      {
        "id": "uuid",
        "poemId": "1",
        "poemTitle": "静夜思",
        "poemAuthor": "李白",
        "poemDynasty": "唐",
        "createdAt": "2026-07-23T00:00:00.000Z",
        "updatedAt": "2026-07-23T00:00:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### `POST /api/v1/favorites`

添加收藏（同一诗词不可重复收藏）。

**🔒 需认证**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `poemId` | string | **是** | 诗词 ID |
| `poemTitle` | string | **是** | 诗词标题 |
| `poemAuthor` | string | 否 | 作者 |
| `poemDynasty` | string | 否 | 朝代 |

---

### `DELETE /api/v1/favorites/:poemId`

取消收藏。

**🔒 需认证**

```dart
final res = await http.delete(
  Uri.parse('$baseUrl/api/v1/favorites/1'),
  headers: {'Authorization': 'Bearer $token'},
);
```

---

### `GET /api/v1/favorites/sync`

收藏同步 — 返回全部收藏 + `syncToken`（最新 updatedAt），用于多端同步。

**🔒 需认证**

```dart
// Flutter 多端同步示例
Future<void> syncFavorites() async {
  final res = await http.get(
    Uri.parse('$baseUrl/api/v1/favorites/sync'),
    headers: {'Authorization': 'Bearer $token'},
  );
  final json = jsonDecode(res.body);
  if (json['success']) {
    final newToken = json['data']['syncToken'];
    final lastToken = prefs.getString('fav_sync_token');
    if (lastToken != newToken) {
      // 数据有更新，刷新本地收藏
      await prefs.setString('fav_sync_token', newToken);
      final favorites = json['data']['favorites'];
      // 同步到本地数据库 ...
    }
  }
}
```

```json
{
  "success": true,
  "data": {
    "favorites": [
      { "id": "uuid", "poemId": "1", "poemTitle": "静夜思", "createdAt": "...", "updatedAt": "..." }
    ],
    "syncToken": "2026-07-23T10:30:00.000Z",
    "total": 5
  }
}
```

---

## 8. 阅读历史接口 🔒

### `GET /api/v1/history`

获取阅读历史（按时间倒序，最近 50 条）。

**🔒 需认证**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "uuid",
        "poemId": "1",
        "poemTitle": "静夜思",
        "poemAuthor": "李白",
        "poemDynasty": "唐",
        "readAt": "2026-07-23T10:30:00.000Z"
      }
    ],
    "total": 1
  }
}
```

---

### `POST /api/v1/history`

记录阅读（每次阅读创建新记录）。

**🔒 需认证**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `poemId` | string | **是** | 诗词 ID |
| `poemTitle` | string | **是** | 诗词标题 |
| `poemAuthor` | string | 否 | 作者 |
| `poemDynasty` | string | 否 | 朝代 |

```dart
// 进入诗词详情页时自动记录
void onPoemView(Poem poem) {
  apiClient.post('/api/v1/history', {
    'poemId': poem.id.toString(),
    'poemTitle': poem.title,
    'poemAuthor': poem.author,
    'poemDynasty': poem.dynasty,
  });
}
```

---

## 9. 阅读统计接口

### `GET /api/v1/stats/reading`

全局阅读统计 — 热门诗词/作者排行 + 近 7 日每日阅读量。适合做首页数据看板。

**无需认证**

> ⚠️ **实测（2026-08）**：结构正确，但当前 `totalReads`/`totalPoems` 为 0、`topPoems`/`topAuthors` 为空数组
> （服务端尚无阅读记录上报）。UI 需对空数据优雅降级（隐藏排行区块）。

```json
{
  "success": true,
  "data": {
    "totalReads": 12580,
    "totalPoems": 3200,
    "topPoems": [
      { "poemId": "1", "poemTitle": "静夜思", "count": 523 }
    ],
    "topAuthors": [
      { "author": "李白", "count": 1890 }
    ],
    "readsByDay": [
      { "date": "2026-07-17", "count": 120 },
      { "date": "2026-07-18", "count": 145 },
      { "date": "2026-07-19", "count": 98 },
      { "date": "2026-07-20", "count": 210 },
      { "date": "2026-07-21", "count": 187 },
      { "date": "2026-07-22", "count": 156 },
      { "date": "2026-07-23", "count": 132 }
    ]
  }
}
```

---

## Flutter 数据模型

```dart
// lib/models/poem.dart
class Poem {
  final int id;
  final String title;
  final String content;
  final String? author;
  final String? dynasty;
  final String? type;

  Poem({required this.id, required this.title, required this.content,
        this.author, this.dynasty, this.type});

  factory Poem.fromJson(Map<String, dynamic> json) => Poem(
    id: json['id'],
    title: json['title'],
    content: json['content'],
    author: json['author'],
    dynasty: json['dynasty'],
    type: json['type'],
  );
}

// lib/models/author.dart
class Author {
  final int id;
  final String name;
  final String? dynasty;
  final String? description;
  final int? poemCount;

  Author({required this.id, required this.name,
          this.dynasty, this.description, this.poemCount});

  factory Author.fromJson(Map<String, dynamic> json) => Author(
    id: json['id'],
    name: json['name'],
    dynasty: json['dynasty'],
    description: json['description'],
    poemCount: json['poemCount'],
  );
}

// lib/models/ai_analysis.dart
class AIAnalysis {
  final String background;
  final String appreciation;
  final List<String> keywords;
  final List<String> emotions;

  AIAnalysis({required this.background, required this.appreciation,
              required this.keywords, required this.emotions});

  factory AIAnalysis.fromJson(Map<String, dynamic> json) => AIAnalysis(
    background: json['background'],
    appreciation: json['appreciation'],
    keywords: List<String>.from(json['keywords']),
    emotions: List<String>.from(json['emotions']),
  );
}

// lib/models/user.dart
class User {
  final String id;
  final String email;
  final String? name;
  final String? avatar;
  final String createdAt;

  User({required this.id, required this.email,
        this.name, this.avatar, required this.createdAt});

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'],
    email: json['email'],
    name: json['name'],
    avatar: json['avatar'],
    createdAt: json['createdAt'],
  );
}

// lib/models/reading_stats.dart
class ReadingStats {
  final int totalReads;
  final int totalPoems;
  final List<StatItem> topPoems;
  final List<StatItem> topAuthors;
  final List<DailyCount> readsByDay;

  ReadingStats({required this.totalReads, required this.totalPoems,
                required this.topPoems, required this.topAuthors,
                required this.readsByDay});

  factory ReadingStats.fromJson(Map<String, dynamic> json) => ReadingStats(
    totalReads: json['totalReads'],
    totalPoems: json['totalPoems'],
    topPoems: (json['topPoems'] as List).map((e) => StatItem.fromJson(e)).toList(),
    topAuthors: (json['topAuthors'] as List).map((e) => StatItem.fromJson(e)).toList(),
    readsByDay: (json['readsByDay'] as List).map((e) => DailyCount.fromJson(e)).toList(),
  );
}

class StatItem {
  final String label;
  final String subtitle;
  final int count;
  StatItem({required this.label, required this.subtitle, required this.count});
  factory StatItem.fromJson(Map<String, dynamic> json) {
    // 兼容 poemId+poemTitle 和 author 两种字段
    final label = json['poemTitle'] ?? json['author'] ?? '';
    final subtitle = json['poemId'] ?? json['author'] ?? '';
    return StatItem(label: label, subtitle: subtitle.toString(), count: json['count']);
  }
}

class DailyCount {
  final String date;
  final int count;
  DailyCount({required this.date, required this.count});
  factory DailyCount.fromJson(Map<String, dynamic> json) =>
    DailyCount(date: json['date'], count: json['count']);
}
```

---

## Flutter API 客户端封装

```dart
// lib/services/api_client.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiException implements Exception {
  final String code;
  final String message;
  ApiException(this.code, this.message);
  @override String toString() => '[$code] $message';
}

class ApiClient {
  static const baseUrl = 'https://www.chinesepoetry.space';
  String? _token;

  String? get token => _token;
  bool get isLoggedIn => _token != null;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> get(String path,
      {Map<String, String>? params}) async {
    var uri = Uri.parse('$baseUrl$path');
    if (params != null) {
      uri = uri.replace(queryParameters: params);
    }
    final res = await http.get(uri, headers: _headers);
    return _handleResponse(res);
  }

  Future<Map<String, dynamic>> post(String path,
      Map<String, dynamic> body) async {
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _handleResponse(res);
  }

  Future<Map<String, dynamic>> put(String path,
      Map<String, dynamic> body) async {
    final res = await http.put(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _handleResponse(res);
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final res = await http.delete(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
    );
    return _handleResponse(res);
  }

  Map<String, dynamic> _handleResponse(http.Response res) {
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    if (json['success'] != true) {
      throw ApiException(json['code'] ?? 'UNKNOWN',
          json['message'] ?? '请求失败');
    }
    return json['data'];
  }

  // ─── 认证 ─────────────────────────────────────────────────
  Future<String> login(String email, String password) async {
    final data = await post('/api/v1/user/login', {
      'email': email, 'password': password,
    });
    _token = data['token'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
    return _token!;
  }

  Future<String> register(String email, String password,
      {String? name}) async {
    final data = await post('/api/v1/user/register', {
      'email': email, 'password': password,
      if (name != null) 'name': name,
    });
    _token = data['token'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
    return _token!;
  }

  void logout() {
    _token = null;
    SharedPreferences.getInstance()
        .then((p) => p.remove('auth_token'));
  }
}
```

---

## 端点速查表

| # | 方法 | 路径 | 说明 | 认证 | 限流 |
|---|------|------|------|------|------|
| 1 | GET | `/api/v1/home` | 首页聚合 | — | — |
| 2 | GET | `/api/v1/discover` | 发现页 | — | — |
| 3 | GET | `/api/v1/categories` | 分类列表 | — | — |
| 4 | GET | `/api/v1/recommend` | 为你推荐 | — | — |
| 5 | GET | `/api/v1/quote` | 每日一句 | — | — |
| 6 | GET | `/api/v1/solar-term` | 节气推荐 | — | — |
| 7 | GET | `/api/v1/config` | 配置+Banner | — | — |
| 8 | GET | `/api/v1/poems` | 诗词列表 | — | — |
| 9 | GET | `/api/v1/poems/:id` | 诗词详情 | — | — |
| 10 | GET | `/api/v1/poems/random` | 随机诗词 | — | — |
| 11 | GET | `/api/v1/authors` | 作者列表 | — | — |
| 12 | GET | `/api/v1/authors/:id` | 作者详情 | — | — |
| 13 | GET | `/api/v1/search` | 全文搜索 | — | — |
| 14 | POST | `/api/v1/ai/analyse` | AI 赏析 | 🔒 | ⏱ |
| 15 | POST | `/api/v1/ai/ask` | AI 问答 | 🔒 | ⏱ |
| 16 | POST | `/api/v1/ai/translate` | AI 翻译 | 🔒 | ⏱ |
| 17 | POST | `/api/v1/user/register` | 注册 | — | — |
| 18 | POST | `/api/v1/user/login` | 登录 | — | — |
| 19 | GET | `/api/v1/user/profile` | 个人信息 | 🔒 | — |
| 20 | PUT | `/api/v1/user/profile` | 更新信息 | 🔒 | — |
| 21 | GET | `/api/v1/favorites` | 收藏列表 | 🔒 | — |
| 22 | POST | `/api/v1/favorites` | 添加收藏 | 🔒 | — |
| 23 | DELETE | `/api/v1/favorites/:poemId` | 取消收藏 | 🔒 | — |
| 24 | GET | `/api/v1/favorites/sync` | 收藏同步 | 🔒 | — |
| 25 | GET | `/api/v1/history` | 阅读历史 | 🔒 | — |
| 26 | POST | `/api/v1/history` | 记录阅读 | 🔒 | — |
| 27 | GET | `/api/v1/stats/reading` | 阅读统计 | — | — |

---

## 常见 Flutter 集成场景

### 开屏页 — 每日一句

```dart
Future<void> loadSplash() async {
  final quote = await apiClient.get('/api/v1/quote');
  // quote['content'] — 诗句
  // quote['author'] — 作者
  // quote['source'] — 出处
  // quote['date'] — 日期
}
```

### 首页 — 多接口并行

```dart
final results = await Future.wait([
  apiClient.get('/api/v1/home'),
  apiClient.get('/api/v1/solar-term'),
  apiClient.get('/api/v1/config'),
  apiClient.get('/api/v1/stats/reading'),
]);
```

### 浏览页 — 分页加载

```dart
int page = 1;
final poems = <Poem>[];
bool hasMore = true;

Future<void> loadMore() async {
  if (!hasMore) return;
  final data = await apiClient.get('/api/v1/poems', params: {
    'page': page.toString(),
    'pageSize': '20',
    if (dynasty != null) 'dynasty': dynasty!,
    if (type != null) 'type': type!,
  });
  final list = (data['poems'] as List).map((e) => Poem.fromJson(e)).toList();
  poems.addAll(list);
  hasMore = poems.length < data['total'];
  page++;
}
```

### 详情页 — 记录阅读

```dart
Future<void> loadPoem(int id) async {
  final poem = Poem.fromJson(await apiClient.get('/api/v1/poems/$id'));
  // 自动记录阅读
  if (apiClient.isLoggedIn) {
    unawaited(apiClient.post('/api/v1/history', {
      'poemId': poem.id.toString(),
      'poemTitle': poem.title,
      'poemAuthor': poem.author,
      'poemDynasty': poem.dynasty,
    }));
  }
}
```

### AI 赏析 — 加载状态处理

```dart
Future<AIAnalysis?> analyzePoem(Poem poem) async {
  try {
    final data = await apiClient.post('/api/v1/ai/analyse', {
      'title': poem.title,
      'content': poem.content,
      'author': poem.author,
      'dynasty': poem.dynasty,
    });
    return AIAnalysis.fromJson(data);
  } on ApiException catch (e) {
    if (e.code == 'UNAUTHORIZED') {
      // 跳转登录
      Navigator.pushNamed(context, '/login');
    } else if (e.code == 'RATE_LIMITED') {
      // 提示稍后再试
      showSnackBar('请求太频繁，请稍后再试');
    }
    return null;
  }
}
```

### 收藏同步 — 定时检查

```dart
Timer.periodic(const Duration(minutes: 5), (_) async {
  if (!apiClient.isLoggedIn) return;
  final data = await apiClient.get('/api/v1/favorites/sync');
  final newToken = data['syncToken'];
  final oldToken = prefs.getString('fav_sync_token');
  if (newToken != oldToken) {
    await prefs.setString('fav_sync_token', newToken);
    // 更新本地收藏数据 ...
  }
});
```


所有接口支持 lang 参数切换简繁体：
参数值	说明
zh-Hans	简体中文（默认）
zh-Hant	繁体中文

curl "/api/v1/poems?lang=zh-Hant"