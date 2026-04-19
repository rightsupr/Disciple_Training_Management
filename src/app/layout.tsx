import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "天路历程",
  description: "每日灵修、周任务、背经打卡与管理员管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
