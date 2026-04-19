# 天路历程

一个基于 Next.js + SQLite 的门训打卡网页，支持：

- 每日灵修、每日读经、周任务、背经内容展示
- 成员点击按钮完成打卡
- 管理员登录后台
- 参与人员管理
- Excel 导入每日内容
- Excel 导出打卡明细和每日汇总

## 技术栈

- Next.js 16
- React 19
- better-sqlite3
- xlsx

数据库默认保存在 `./data/app.db`。

## 本地启动

### 1. 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

建议至少修改下面几项：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成你的管理员密码
SESSION_SECRET=请改成长随机字符串
APP_TIMEZONE=Asia/Shanghai
DATABASE_PATH=./data/app.db
```

### 4. 启动开发环境

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 生产部署

下面这套流程适合你把项目传到 GitHub 后，在服务器上 `git clone` / `git pull` 直接运行。

### 1. 服务器环境要求

- Linux 服务器
- Node.js 20+
- npm 10+
- 建议安装原生模块编译工具，因为 `better-sqlite3` 在部分机器上会编译安装

Ubuntu / Debian 可执行：

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++
```

### 2. 拉取代码

```bash
git clone <你的仓库地址>
cd Disciple_Training_Management
```

后续更新：

```bash
git pull
```

### 3. 安装依赖

有 `package-lock.json` 时建议使用：

```bash
npm ci
```

如果你修改了依赖，也可以用：

```bash
npm install
```

### 4. 配置生产环境变量

复制环境文件：

```bash
cp .env.example .env.production
```

至少修改这些值：

```env
ADMIN_USERNAME=你的管理员账号
ADMIN_PASSWORD=你的强密码
SESSION_SECRET=一段足够长的随机字符串
APP_TIMEZONE=Asia/Shanghai
DATABASE_PATH=./data/app.db
```

说明：

- `DATABASE_PATH` 默认是 `./data/app.db`
- 请确保运行项目的用户对 `data/` 目录有写权限
- 如果你希望数据库放到单独磁盘，也可以写绝对路径，比如 `/srv/disciple-training/app.db`

### 5. 构建生产包

```bash
npm run build
```

### 6. 启动生产服务

```bash
HOSTNAME=0.0.0.0 PORT=3000 npm run start
```

启动后可通过：

```text
http://服务器IP:3000
```

访问。

如果你前面挂了 Nginx 反向代理，就把域名转发到这个端口即可。

## 推荐的更新流程

以后你每次把新代码推到 GitHub，服务器上按下面执行即可：

```bash
git pull
npm ci
npm run build
HOSTNAME=0.0.0.0 PORT=3000 npm run start
```

如果你使用 `pm2`、`systemd` 或 Docker 托管，只需要把启动命令替换成对应方式。

## 管理员后台

网页右上角有设置按钮，点击后进入管理员系统。

管理员可以做三件事：

- 设置参与打卡的人员
- 上传每日打卡内容
- 导出打卡情况

## Excel 导入格式

上传内容时支持 `.xlsx`、`.xls`、`.csv`。

表头格式使用：

```text
日期, 灵修内容, 每日读经, 背经, 周任务
```

示例：

| 日期 | 灵修内容 | 每日读经 | 背经 | 周任务 |
|---|---|---|---|---|
| 2026-04-19 | 阅读约翰福音第 3 章并默想 | 阅读约翰福音第 4 章 | 罗马书 8:1-2 | 完成本周分享记录 |

说明：

- 日期支持 `2026-04-19`、`2026/04/19`、`2026年4月19日`
- 如果某一列留空，对应项目当天会显示为未上传
- 同一天重复导入会覆盖该日期原有内容

## Excel 导出内容

管理员导出后会得到一个 Excel 文件，包含两个工作表：

- `打卡记录`
- `每日汇总`

## 数据存储说明

- 所有参与人员、每日内容、打卡记录都保存在 SQLite 数据库中
- 默认文件位置：`data/app.db`
- 删除代码不会自动删除数据库，但如果你删除了 `data/app.db`，历史数据会丢失
- 生产环境建议定期备份 `data/app.db`

## 已验证命令

当前项目已通过：

```bash
npm run lint
npm run build
npm run dev
```
