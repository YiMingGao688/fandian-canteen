# 禾序饭堂

校园食堂预约点餐示例。面向学生的手机 H5、食堂 Web 管理后台和只读运营大屏是三个独立入口，使用同一套 Spring Boot API 与本地演示数据库。

## 三个入口

本机运行后可分别打开：

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| 学生手机 H5 | <http://127.0.0.1:15173/#/m> | 选窗口、点餐、选取餐时段、查看预约和取餐码 |
| 食堂 Web 管理 | <http://127.0.0.1:15173/#/admin> | 未登录时进入管理登录页，登录后直达经营概览；可查看订单、维护菜品与回复反馈 |
| 运营可视化大屏 | <http://127.0.0.1:15173/#/screen> | 展示全校窗口运营汇总、ECharts 图表和可旋转的 Three.js 食堂示意，展示账号只读 |

`/` 会按屏幕宽度转到手机 H5 或管理后台。管理端未登录时会转到登录页，已登录管理员直接进入经营概览；顶栏的大屏入口会在新标签页打开并继续校验账号权限。手机 H5 是适配窄屏的网页，不是原生 Android/iOS 应用。

## 本地启动

Windows PowerShell，首次运行先安装网页依赖、构建后端，再启动本地服务：

```powershell
cd .\web
npm.cmd ci
cd ..
python -X utf8 .\scripts\build_backend.py
.\start.ps1
```

需要 JDK 17、Maven、Node.js、Python，以及脚本中配置的本机 MySQL/Redis 程序。默认端口：Vite `15173`、Spring Boot `18088`、项目独立 MySQL `13316`、Redis `16379`。服务只监听本机回环地址；启动、停止和私有数据目录由 `start.ps1`、`stop.ps1` 和 `.local/` 管理。停止服务不会删除数据库文件。

本地体验账号均使用演示密码 `Campus@2026`：

| 角色 | 账号 | 权限 |
| --- | --- | --- |
| 学生 | `20260001`、`20260002` | 学生 H5 点餐和本人预约 |
| 窗口工作人员 | `window01`、`window02`、`window03` | 管理各自绑定的窗口 |
| 全校管理员 | `canteen_admin` | 管理所有食堂窗口 |
| 大屏展示 | `canteen_screen` | 只读查看汇总大屏 |

以上账号和数据只为本地演示准备，不是学校真实账号。系统当前支付为模拟状态，不扣款、不连接微信或其他支付渠道。图片和营养数据也是示意值。

### 支付宝沙箱联调

默认 `CAMPUS_PAYMENT_MODE=demo`，仍走本地模拟支付。使用沙箱前，先在开放平台轮换已暴露的应用私钥，并把新应用私钥、支付宝公钥和 APPID 分别保存到 `.local/alipay-app-private-key.txt`、`.local/alipay-public-key.txt`、`.local/alipay-app-id.txt`；不要把密钥贴到聊天或提交到 Git。启动配置会读取这些 Git 忽略的本机文件、`.local/alipay-notify-url.txt` 和 `.local/alipay-return-url.txt`，参数齐全后自动切到 `alipay-sandbox`。也可通过 `CAMPUS_ALIPAY_*` 环境变量覆盖。手机支付回跳地址应填写手机可访问的 H5 地址；当前本机开发回跳地址只适合在同一台电脑浏览器联调。密钥只写入 `.local/application-local.yml`，不要提交到 Git。

## 功能概览

- 学生学号注册登录、窗口与菜单浏览、搜索、收藏、购物车、预约时段、备注和餐具选择。
- 预约提交时从数据库读取菜价，并在 MySQL 事务中扣减菜品库存和时段名额；重复请求使用 requestId 幂等。
- 学生查看预约、模拟支付、取消或改约；窗口按“待接单 → 备餐中 → 待取餐 → 已取餐”操作，使用八位取餐码核销。
- 管理端维护菜品价格、库存和上下架状态，查看预约和反馈、回复学生。
- 大屏每 15 秒读取汇总 API，ECharts 展示核销金额走势、菜品排名、分类占比、窗口订单状态桑基图与时段占用；Three.js 中心实体模型支持窗口选择、巡航和复位，节点状态来自接口。模型位置只作示意，不表示校园真实坐标。只读展示接口不返回学生姓名、学号或取餐码。

## 目录

- `backend/`：基于 Spring Boot、MyBatis 的 API；原点餐业务表与服务仍在，新增校园预约模块。
- `web/`：Vue 3、Vue Router、Vite、ECharts、Three.js 和 Lucide 图标。
- `database/`：原业务表结构、校园扩展表结构与演示种子数据。
- `scripts/`：本机服务、构建和接口/浏览器验证脚本。
- `docs/`：需求对照、设计说明、使用手册和测试记录。
- `artifacts/`：本地验证报告和预览截图，不纳入 Git。

## 文档与验证

- [需求规格与任务书对照](docs/需求规格说明.md)
- [系统设计说明](docs/系统设计说明.md)
- [用户使用手册](docs/用户使用手册.md)
- [测试记录](docs/测试记录.md)
- [验证源代码来源及图片来源](ASSET_SOURCES.md)

已验证本地后端 37 项接口检查、三端浏览器主流程 7 项检查以及前后端构建。测试结论和范围见测试记录；当前结果不代表 500 并发压力测试或真实支付认证。

## 上游来源说明

后端基础代码由 GitHub 项目 [`shuhongfan/sky-take-out`](https://github.com/shuhongfan/sky-take-out) 的提交 [`267313f`](https://github.com/shuhongfan/sky-take-out/tree/267313f948bba2001fbc497995a39ef61f2c621f) 派生，新增的校园业务、手机 H5、后台界面和运营大屏在此基础上实现。此次检查的上游提交根目录未发现 `LICENSE` 文件；本说明记录技术来源，不等于许可证授权。公开发布或提交前应确认上游代码的使用和再分发条件，并按课程要求说明改造范围。

运营大屏参考[阿里云 DataV 设计库](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/design-library)关于主视觉居中、统一字体与色彩体系的设计方法。页面使用自有 Vue/ECharts 源码、Three.js 程序化实体模型和校园汇总 API；未复制阿里云模板或专有素材，不依赖 DataV 云端运行服务。
