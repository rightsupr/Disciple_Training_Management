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

下面这套流程是按 `Debian 13` 实际跑通的。`Ubuntu 22.04 / 24.04` 也基本可以照搬。

### 1. 服务器要求

- Linux 服务器
- 推荐 `Debian 13`
- Node.js `20+`
- npm `10+`
- 建议使用 `Nginx + systemd`

### 2. 登录服务器

第一次连接会看到 SSH 指纹确认，输入 `yes` 即可。

```bash
ssh root@你的服务器IP
```

例如：

```bash
ssh root@149.104.28.144
```

### 3. 安装基础环境

```bash
apt update
apt install -y git curl nginx build-essential python3 make g++
```

说明：

- `git` 用于拉代码
- `curl` 用于安装 Node.js
- `nginx` 用于反向代理
- `build-essential python3 make g++` 用于编译 `better-sqlite3`

### 4. 安装 Node.js

项目要求 Node.js `20+`，推荐直接安装 `Node.js 22`：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

node -v
npm -v
```

### 5. 拉取代码

下面的路径只是示例，你也可以换成自己的目录。

```bash
mkdir -p /srv/tianlu
cd /srv/tianlu
git clone https://github.com/你的用户名/你的仓库名.git app
cd /srv/tianlu/app
```

### 6. 配置生产环境变量

复制环境文件：

```bash
cp .env.example .env.production
nano .env.production
```

至少修改这些值：

```env
ADMIN_USERNAME=你的管理员账号
ADMIN_PASSWORD=你的强密码
SESSION_SECRET=一段足够长的随机字符串
APP_TIMEZONE=Asia/Shanghai
DATABASE_PATH=/var/lib/tianlu/app.db
```

然后创建数据库目录：

```bash
mkdir -p /var/lib/tianlu
```

说明：

- 生产环境建议给 `DATABASE_PATH` 使用绝对路径
- 当前项目会自动创建数据库所在目录，但建议提前手动创建
- SQLite 数据会保存在 `/var/lib/tianlu/app.db`

### 7. 安装依赖并构建

仓库里有 `package-lock.json`，生产环境优先使用：

```bash
npm ci
npm run build
```

### 8. 手工启动一次做验证

这一步只是确认项目本身能否正常跑起来，不是最终托管方式。

```bash
NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 npm run start
```

如果启动成功，会看到类似输出：

```text
Local:   http://localhost:3000
Network: http://你的服务器IP:3000
Ready in ...
```

这时可以在浏览器访问：

```text
http://服务器IP:3000
```

验证完成后，按 `Ctrl + C` 停掉这次手工启动。

### 9. 使用 systemd 常驻运行

不要长期依赖手工 `npm run start`。正确方式是交给 `systemd` 托管。

创建服务文件：

```bash
cat > /etc/systemd/system/tianlu.service <<'EOF'
[Unit]
Description=Tianlu Checkin App
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/tianlu/app
EnvironmentFile=/srv/tianlu/app/.env.production
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
```

启动并设置开机自启：

```bash
systemctl daemon-reload
systemctl enable --now tianlu
systemctl status tianlu --no-pager
```

### 10. 验证应用本机可用

检查 `3000` 端口是否监听：

```bash
ss -ltnp | grep 3000
```

检查本机请求是否成功：

```bash
curl -I http://127.0.0.1:3000
```

如果返回 `HTTP/1.1 200 OK` 或类似响应，说明应用本身已正常运行。

### 11. 配置 Nginx

正式环境不建议让用户直接访问 `3000` 端口，而是由 Nginx 监听 `80/443` 再转发到 `3000`。

```bash
cat > /etc/nginx/sites-available/tianlu <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 你的域名 你的服务器IP _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf /etc/nginx/sites-available/tianlu /etc/nginx/sites-enabled/tianlu
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx
```

本机验证：

```bash
curl -I http://127.0.0.1
```

如果 Nginx 已经正确代理，浏览器就可以访问：

```text
http://服务器IP
```

### 12. 防火墙和安全组

云服务器后台至少要放行：

- `22`：SSH
- `80`：HTTP
- `443`：HTTPS

如果只测试应用本身，也可以临时放行 `3000`，但正式环境不建议长期对外开放 `3000`。

### 13. 域名和 HTTPS

如果你已经有域名，先把域名 `A 记录` 指向服务器 IPv4。

然后安装 Certbot：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d 你的域名 -d www.你的域名
```

完成后即可通过：

```text
https://你的域名
```

访问。

### 14. 推荐的更新流程

以后每次本地改完代码并推到 GitHub 后，服务器执行：

```bash
cd /srv/tianlu/app
git pull
npm ci
npm run build
systemctl restart tianlu
systemctl status tianlu --no-pager
```

### 15. 常用排查命令

查看应用状态：

```bash
systemctl status tianlu --no-pager
```

查看应用日志：

```bash
journalctl -u tianlu -n 100 --no-pager
journalctl -u tianlu -f
```

查看 Nginx 状态：

```bash
systemctl status nginx --no-pager
```

查看本机 `3000` 端口：

```bash
curl -I http://127.0.0.1:3000
```

查看 Nginx 是否正常代理：

```bash
curl -I http://127.0.0.1
```

查看 `3000` 是否在监听：

```bash
ss -ltnp | grep 3000
```

### 16. 管理员登录说明

管理员登录依赖浏览器 cookie。

- 用 `http://服务器IP` 或 `http://域名` 访问时，也可以正常保持登录
- 配好 HTTPS 后，cookie 会自动按安全方式工作
- 如果出现“登录后再次打开设置窗口又掉登录”，优先确认你已经部署了最新版本代码

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
