"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import { formatChineseDateLabel, shiftDateKey } from "@/lib/date";
import {
  CHECKIN_ITEMS,
  CHECKIN_ITEM_META,
  CONTENT_FIELD_MAP,
  type AdminSessionState,
  type CheckinItemKey,
  type DashboardData,
  type ImportPreviewResult,
  type ParticipantCalendarData,
  type ParticipantSummary,
} from "@/lib/types";

type CheckinAppProps = {
  initialDate: string;
  initialData: DashboardData;
};

type ApiSuccess<T> = {
  data: T;
};

type ApiError = {
  error: string;
};

type CalendarDay = {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function parseDateParts(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return getMonthKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}

function buildCalendarDays(monthKey: string, selectedDate: string, todayKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const calendarDays: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - startWeekday + 1;
    const cellDate = new Date(Date.UTC(year, month - 1, dayOffset));
    const cellYear = cellDate.getUTCFullYear();
    const cellMonth = cellDate.getUTCMonth() + 1;
    const cellDay = cellDate.getUTCDate();
    const dateKey = `${cellYear}-${String(cellMonth).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;

    calendarDays.push({
      dateKey,
      day: dayOffset <= 0 ? prevMonthLastDay + dayOffset : cellDay,
      inCurrentMonth: dayOffset > 0 && dayOffset <= daysInMonth,
      isToday: dateKey === todayKey,
      isSelected: dateKey === selectedDate,
    });
  }

  return calendarDays;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function readJson<T>(response: Response) {
  const body = (await response.json()) as ApiSuccess<T> | ApiError;

  if (!response.ok || "error" in body) {
    throw new Error("error" in body ? body.error : "请求失败。");
  }

  return body.data;
}

export function CheckinApp({ initialDate, initialData }: CheckinAppProps) {
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dashboard, setDashboard] = useState(initialData);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSessionState>({
    authenticated: false,
  });
  const [adminLoading, setAdminLoading] = useState(false);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [participantName, setParticipantName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importFeedback, setImportFeedback] = useState<{
    type: "success" | "info";
    text: string;
  } | null>(null);
  const [exportRange, setExportRange] = useState({
    from: "",
    to: "",
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const { year, month } = parseDateParts(initialDate);
    return getMonthKey(year, month);
  });
  const [participantCalendarTarget, setParticipantCalendarTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [participantCalendarMonth, setParticipantCalendarMonth] = useState(() => {
    const { year, month } = parseDateParts(initialDate);
    return getMonthKey(year, month);
  });
  const [participantCalendarData, setParticipantCalendarData] =
    useState<ParticipantCalendarData | null>(null);
  const [participantCalendarLoading, setParticipantCalendarLoading] = useState(false);

  useEffect(() => {
    if (!isDatePickerOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!datePickerRef.current?.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDatePickerOpen(false);
      }
    }

    function handleScroll() {
      setIsDatePickerOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isDatePickerOpen]);

  useEffect(() => {
    if (!participantCalendarTarget) {
      return;
    }

    const target = participantCalendarTarget;
    let isCancelled = false;

    async function loadParticipantCalendar() {
      setParticipantCalendarLoading(true);

      try {
        const result = await readJson<ParticipantCalendarData>(
          await fetch(
            `/api/participants/${target.id}/calendar?month=${encodeURIComponent(
              participantCalendarMonth,
            )}`,
            {
              cache: "no-store",
            },
          ),
        );

        if (!isCancelled) {
          setParticipantCalendarData(result);
        }
      } catch (error) {
        if (!isCancelled) {
          setNotice(getErrorMessage(error, "读取人物打卡月历失败。"));
        }
      } finally {
        if (!isCancelled) {
          setParticipantCalendarLoading(false);
        }
      }
    }

    void loadParticipantCalendar();

    return () => {
      isCancelled = true;
    };
  }, [participantCalendarMonth, participantCalendarTarget]);

  async function refreshDashboard(date: string, message?: string) {
    setLoadingDashboard(true);

    try {
      const result = await readJson<DashboardData>(
        await fetch(`/api/dashboard?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        }),
      );

      startTransition(() => {
        setSelectedDate(date);
        setDashboard(result);
        if (message) {
          setNotice(message);
        }
      });
    } catch (error) {
      setNotice(getErrorMessage(error, "加载页面数据失败。"));
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function openAdminModal() {
    setModalOpen(true);
    setAdminLoading(true);

    try {
      const session = await readJson<AdminSessionState>(
        await fetch("/api/admin/session", {
          cache: "no-store",
        }),
      );

      setAdminSession(session);

      if (session.authenticated) {
        await loadParticipants();
      }
    } catch (error) {
      setNotice(getErrorMessage(error, "读取管理员状态失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function loadParticipants() {
    const result = await readJson<ParticipantSummary[]>(
      await fetch("/api/admin/participants", {
        cache: "no-store",
      }),
    );

    setParticipants(result);
  }

  async function handleToggleCheckin(participantId: number, itemType: CheckinItemKey) {
    const actionKey = `${participantId}:${itemType}`;
    setPendingAction(actionKey);

    try {
      const result = await readJson<DashboardData>(
        await fetch("/api/checkins/toggle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: selectedDate,
            participantId,
            itemType,
          }),
        }),
      );

      startTransition(() => {
        setDashboard(result);
        setNotice(`已更新 ${CHECKIN_ITEM_META[itemType].label} 打卡。`);
      });
    } catch (error) {
      setNotice(getErrorMessage(error, "打卡失败。"));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAdminLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminLoading(true);

    try {
      const session = await readJson<AdminSessionState>(
        await fetch("/api/admin/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentials),
        }),
      );

      setAdminSession(session);
      setCredentials((current) => ({
        ...current,
        password: "",
      }));
      await loadParticipants();
      setNotice("管理员已登录。");
    } catch (error) {
      setNotice(getErrorMessage(error, "管理员登录失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleAdminLogout() {
    setAdminLoading(true);

    try {
      await readJson<{ authenticated: boolean }>(
        await fetch("/api/admin/logout", {
          method: "POST",
        }),
      );

      setAdminSession({ authenticated: false });
      setParticipants([]);
      setImportFile(null);
      setNotice("管理员已退出登录。");
    } catch (error) {
      setNotice(getErrorMessage(error, "退出登录失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleParticipantCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminLoading(true);

    try {
      const result = await readJson<{
        restored: boolean;
        participants: ParticipantSummary[];
      }>(
        await fetch("/api/admin/participants", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: participantName,
          }),
        }),
      );

      setParticipants(result.participants);
      setParticipantName("");
      await refreshDashboard(selectedDate, result.restored ? "已恢复参与人员。" : "已新增参与人员。");
    } catch (error) {
      setNotice(getErrorMessage(error, "新增参与人员失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleParticipantStatusChange(participantId: number, isActive: boolean) {
    setAdminLoading(true);

    try {
      const result = await readJson<ParticipantSummary[]>(
        await fetch(`/api/admin/participants/${participantId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isActive,
          }),
        }),
      );

      setParticipants(result);
      await refreshDashboard(selectedDate, isActive ? "已启用参与人员。" : "已停用参与人员。");
    } catch (error) {
      setNotice(getErrorMessage(error, "更新参与人员状态失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleParticipantDelete(participantId: number, participantName: string) {
    const confirmed = window.confirm(
      `确定要删除“${participantName}”吗？删除后该成员的打卡记录也会一并删除。`,
    );

    if (!confirmed) {
      return;
    }

    setAdminLoading(true);

    try {
      const result = await readJson<ParticipantSummary[]>(
        await fetch(`/api/admin/participants/${participantId}`, {
          method: "DELETE",
        }),
      );

      setParticipants(result);
      await refreshDashboard(selectedDate, `已删除参与人员：${participantName}。`);
    } catch (error) {
      setNotice(getErrorMessage(error, "删除参与人员失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleImportConfirm();
  }

  async function handleImportPreview() {
    if (!importFile) {
      setNotice("请先选择 Excel 文件。");
      return;
    }

    setAdminLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const result = await readJson<ImportPreviewResult>(
        await fetch("/api/admin/import/preview", {
          method: "POST",
          body: formData,
        }),
      );

      setImportPreview(result);
      setImportFeedback({
        type: "info",
        text: `预览完成，共识别 ${result.count} 条内容。`,
      });
      setNotice(`预览完成，共识别 ${result.count} 条内容。`);
    } catch (error) {
      setNotice(getErrorMessage(error, "预览导入内容失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleImportConfirm() {
    if (!importFile) {
      setNotice("请先选择 Excel 文件。");
      return;
    }

    setAdminLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const result = await readJson<{ count: number; dates: string[] }>(
        await fetch("/api/admin/import", {
          method: "POST",
          body: formData,
        }),
      );

      setImportFile(null);
      setImportPreview(null);
      setImportFeedback({
        type: "success",
        text: `导入成功，共导入 ${result.count} 条内容。日期：${result.dates.join("、")}`,
      });

      const shouldRefreshCurrentDate = result.dates.includes(selectedDate);
      if (shouldRefreshCurrentDate) {
        await refreshDashboard(
          selectedDate,
          `已导入 ${result.count} 条内容，当前日期数据已刷新。`,
        );
      } else {
        setNotice(`已导入 ${result.count} 条内容。`);
      }
    } catch (error) {
      setNotice(getErrorMessage(error, "导入内容失败。"));
    } finally {
      setAdminLoading(false);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();

    if (exportRange.from) {
      params.set("from", exportRange.from);
    }

    if (exportRange.to) {
      params.set("to", exportRange.to);
    }

    window.location.href = `/api/admin/export${params.toString() ? `?${params}` : ""}`;
  }

  function handleTemplateDownload() {
    const csvContent = [
      "日期,灵修内容,每日读经,背经,周任务",
      `${selectedDate},示例灵修内容,示例每日读经内容,示例背经,示例周任务`,
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "disciple-training-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openDatePicker() {
    const { year, month } = parseDateParts(selectedDate);
    setCalendarMonth(getMonthKey(year, month));
    setIsDatePickerOpen((current) => !current);
  }

  async function handleCalendarSelect(dateKey: string) {
    setIsDatePickerOpen(false);
    await refreshDashboard(dateKey);
  }

  function openParticipantCalendar(participantId: number, participantName: string) {
    const { year, month } = parseDateParts(selectedDate);
    setParticipantCalendarMonth(getMonthKey(year, month));
    setParticipantCalendarTarget({
      id: participantId,
      name: participantName,
    });
    setParticipantCalendarData(null);
  }

  const dateLabel = formatChineseDateLabel(selectedDate, dashboard.todayKey);
  const calendarDays = buildCalendarDays(calendarMonth, selectedDate, dashboard.todayKey);
  const [calendarYear, calendarMonthNumber] = calendarMonth.split("-").map(Number);
  const participantCalendarDays = buildCalendarDays(
    participantCalendarMonth,
    "",
    dashboard.todayKey,
  );
  const participantCalendarDayMap = new Map(
    (participantCalendarData?.days ?? []).map((day) => [day.date, day]),
  );
  const [participantCalendarYear, participantCalendarMonthNumber] = participantCalendarMonth
    .split("-")
    .map(Number);

  return (
    <>
      <main className="page-shell">
        <div className="page-glow page-glow-left" />
        <div className="page-glow page-glow-right" />

        <section className="hero-panel">
          <button className="settings-button" type="button" onClick={openAdminModal}>
            <span aria-hidden="true">⚙</span>
            <span>设置</span>
          </button>

          <div className="hero-copy">
            <p className="hero-kicker">Disciple Training Check-in</p>
            <h1>天路历程</h1>
            <p className="hero-description">
              每日灵修、每日读经、周任务、背经统一打卡。管理员可上传内容、维护参与人员并导出完成记录。
            </p>
          </div>

          <div className="hero-actions">
            <div className="date-switcher">
              <button
                className="date-nav-button"
                type="button"
                onClick={() => refreshDashboard(shiftDateKey(selectedDate, -1))}
                disabled={loadingDashboard}
                aria-label="前一天"
              >
                ‹
              </button>

              <div className="date-switcher-center" ref={datePickerRef}>
                <button
                  className="date-picker-trigger"
                  type="button"
                  onClick={openDatePicker}
                  disabled={loadingDashboard}
                  aria-label="选择日期"
                  aria-expanded={isDatePickerOpen}
                >
                  <span className="date-label">{dateLabel}</span>
                </button>
                {isDatePickerOpen ? (
                  <div className="calendar-popover">
                    <div className="calendar-header">
                      <button
                        className="calendar-nav-button"
                        type="button"
                        onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}
                        aria-label="上一个月"
                      >
                        ‹
                      </button>
                      <strong>{calendarYear}年{calendarMonthNumber}月</strong>
                      <button
                        className="calendar-nav-button"
                        type="button"
                        onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
                        aria-label="下一个月"
                      >
                        ›
                      </button>
                    </div>

                    <div className="calendar-weekdays">
                      {WEEKDAY_LABELS.map((weekday) => (
                        <span key={weekday}>{weekday}</span>
                      ))}
                    </div>

                    <div className="calendar-grid">
                      {calendarDays.map((day) => (
                        <button
                          key={day.dateKey}
                          className={`calendar-day ${day.inCurrentMonth ? "" : "calendar-day-muted"} ${
                            day.isToday ? "calendar-day-today" : ""
                          } ${day.isSelected ? "calendar-day-selected" : ""}`}
                          type="button"
                          onClick={() => handleCalendarSelect(day.dateKey)}
                        >
                          {day.day}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                className="date-nav-button"
                type="button"
                onClick={() => refreshDashboard(shiftDateKey(selectedDate, 1))}
                disabled={loadingDashboard}
                aria-label="后一天"
              >
                ›
              </button>
            </div>

            {notice ? <div className="notice-banner">{notice}</div> : null}
          </div>
        </section>

        <section className="content-panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">当日内容</p>
              <h2>打卡说明</h2>
            </div>
            {loadingDashboard ? <span className="section-status">内容刷新中…</span> : null}
          </div>

          <div className="content-list">
            {CHECKIN_ITEMS.map((item) => {
              const meta = CHECKIN_ITEM_META[item];
              const contentValue = dashboard.content[CONTENT_FIELD_MAP[item]].trim();
              const displayText =
                item === "dailyReading"
                  ? "依照读经计划"
                  : contentValue || "管理员尚未上传这一天的内容。";
              const enabled = contentValue.length > 0;

              return (
                <article
                  key={item}
                  className={`content-card ${
                    item === "dailyReading" || enabled ? "" : "content-card-muted"
                  }`}
                >
                  <div className="content-pill">
                    <span className="content-pill-icon">{meta.icon}</span>
                    <span>{meta.label}</span>
                  </div>

                  <div className="content-body">
                    <p className="content-title">{meta.hint}</p>
                    <p className="content-text">{displayText}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="summary-panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">完成情况</p>
              <h2>全体进度</h2>
            </div>
          </div>

          <div className="summary-grid">
            {[
              dashboard.summary.devotion,
              dashboard.summary.dailyReading,
              dashboard.summary.weeklyTask,
              dashboard.summary.scripture,
            ].map((metric) => (
              <article
                key={metric.key}
                className={`summary-card ${metric.enabled ? "" : "summary-card-disabled"}`}
              >
                <div className="summary-card-head">
                  <span className="summary-label">{metric.label}</span>
                  <span className="summary-value">
                    {metric.enabled ? `${metric.completed}/${metric.total}` : "未开放"}
                  </span>
                </div>
                <div className="summary-bar">
                  <span
                    className="summary-bar-fill"
                    style={{ width: `${Math.round(metric.rate * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="participants-panel">
          <div className="section-heading">
            <div>
              <p className="section-kicker">成员打卡</p>
              <h2>点击按钮即可完成打卡</h2>
            </div>
            <span className="section-status">{dashboard.participants.length} 位参与者</span>
          </div>

          {dashboard.participants.length === 0 ? (
            <div className="empty-state">
              <h3>当前还没有参与人员</h3>
              <p>点击右上角设置，登录管理员后添加人员。</p>
            </div>
          ) : (
            <div className="participant-grid">
              {dashboard.participants.map((participant) => (
                <article
                  className="participant-card participant-card-clickable"
                  key={participant.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openParticipantCalendar(participant.id, participant.name)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openParticipantCalendar(participant.id, participant.name);
                    }
                  }}
                >
                  <div className="participant-head">
                    <div className="participant-avatar">{participant.initials}</div>
                    <div>
                      <h3>{participant.name}</h3>
                      <p>
                        已完成 {participant.completionCount}/
                        {CHECKIN_ITEMS.length}
                      </p>
                    </div>
                  </div>

                  <div className="participant-actions">
                    {CHECKIN_ITEMS.map((item) => {
                      const meta = CHECKIN_ITEM_META[item];
                      const enabled = dashboard.availableItems.includes(item);
                      const checked = participant.statuses[item];
                      const isPending = pendingAction === `${participant.id}:${item}`;

                      return (
                        <button
                          key={item}
                          type="button"
                          className={`checkin-chip ${checked ? "checkin-chip-checked" : ""} ${
                            !enabled ? "checkin-chip-disabled" : ""
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleCheckin(participant.id, item);
                          }}
                          disabled={!enabled || isPending}
                        >
                          <span className="checkin-chip-icon" aria-hidden="true">
                            {checked ? "✓" : meta.icon}
                          </span>
                          <span>{checked ? "已完成" : meta.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-label="管理员后台"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="section-kicker">管理员系统</p>
                <h2>内容管理后台</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setModalOpen(false)}>
                关闭
              </button>
            </div>

            {adminLoading && !adminSession.authenticated ? (
              <div className="empty-state compact">
                <h3>加载中</h3>
                <p>正在检查管理员登录状态。</p>
              </div>
            ) : null}

            {!adminSession.authenticated ? (
              <form className="admin-login" onSubmit={handleAdminLogin}>
                <label className="field">
                  <span>管理员账号</span>
                  <input
                    type="text"
                    value={credentials.username}
                    onChange={(event) =>
                      setCredentials((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                    placeholder="请输入管理员账号"
                  />
                </label>

                <label className="field">
                  <span>管理员密码</span>
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(event) =>
                      setCredentials((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder="请输入管理员密码"
                  />
                </label>

                <button className="primary-button" type="submit" disabled={adminLoading}>
                  {adminLoading ? "登录中…" : "登录后台"}
                </button>
              </form>
            ) : (
              <div className="admin-grid">
                <section className="admin-section">
                  <div className="admin-section-head">
                    <div>
                      <h3>参与人员</h3>
                      <p>新增、启用、停用或删除打卡成员。</p>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleAdminLogout}
                      disabled={adminLoading}
                    >
                      退出登录
                    </button>
                  </div>

                  <form className="inline-form" onSubmit={handleParticipantCreate}>
                    <input
                      type="text"
                      value={participantName}
                      onChange={(event) => setParticipantName(event.target.value)}
                      placeholder="输入姓名后新增"
                    />
                    <button className="primary-button" type="submit" disabled={adminLoading}>
                      添加
                    </button>
                  </form>

                  <div className="participant-admin-list">
                    {participants.map((participant) => (
                      <div className="participant-admin-row" key={participant.id}>
                        <div>
                          <strong>{participant.name}</strong>
                          <p>{participant.isActive ? "当前启用" : "当前停用"}</p>
                        </div>
                        <div className="participant-admin-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              handleParticipantStatusChange(
                                participant.id,
                                !participant.isActive,
                              )
                            }
                            disabled={adminLoading}
                          >
                            {participant.isActive ? "停用" : "启用"}
                          </button>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={() =>
                              handleParticipantDelete(participant.id, participant.name)
                            }
                            disabled={adminLoading}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-section">
                  <div className="admin-section-head">
                    <div>
                      <h3>打卡内容上传</h3>
                      <p>Excel 表头格式：日期、灵修内容、每日读经、背经、周任务。</p>
                    </div>
                    <button className="secondary-button" type="button" onClick={handleTemplateDownload}>
                      下载模板
                    </button>
                  </div>

                  <form className="stack-form" onSubmit={handleImportSubmit}>
                    <label className="upload-picker">
                      <div className="upload-picker-copy">
                        <strong>{importFile ? "已选择文件" : "点击这里选择 Excel 文件"}</strong>
                        <span>
                          {importFile
                            ? importFile.name
                            : "支持 .xlsx、.xls、.csv，选择后可先预览再导入"}
                        </span>
                      </div>
                      <input
                        className="upload-input-hidden"
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => {
                          setImportFile(event.target.files?.[0] ?? null);
                          setImportPreview(null);
                          setImportFeedback(null);
                        }}
                      />
                    </label>

                    <div className="import-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={handleImportPreview}
                        disabled={adminLoading || !importFile}
                      >
                        {adminLoading ? "处理中…" : "预览导入"}
                      </button>
                      <button className="primary-button" type="submit" disabled={adminLoading || !importFile}>
                        {adminLoading ? "上传中…" : "确认导入"}
                      </button>
                    </div>
                  </form>

                  {importFeedback ? (
                    <div
                      className={`import-feedback ${
                        importFeedback.type === "success"
                          ? "import-feedback-success"
                          : "import-feedback-info"
                      }`}
                    >
                      {importFeedback.text}
                    </div>
                  ) : null}

                  {importPreview ? (
                    <div className="import-preview">
                      <div className="import-preview-head">
                        <div>
                          <h4>导入预览</h4>
                          <p>
                            共识别 {importPreview.count} 行，日期范围：
                            {importPreview.dates.join("、")}
                          </p>
                        </div>
                      </div>

                      <div className="import-preview-table">
                        <div className="import-preview-row import-preview-row-head">
                          <span>Excel 行</span>
                          <span>原始日期</span>
                          <span>识别日期</span>
                          <span>灵修内容</span>
                          <span>背经</span>
                          <span>周任务</span>
                        </div>
                        {importPreview.rows.map((row) => (
                          <div className="import-preview-row" key={`${row.rowNumber}-${row.parsedDate}`}>
                            <span>{row.rowNumber}</span>
                            <span>{row.rawDate || "-"}</span>
                            <span>{row.parsedDate}</span>
                            <span>{row.devotionText || "-"}</span>
                            <span>{row.scriptureText || "-"}</span>
                            <span>{row.weeklyTaskText || "-"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="admin-section">
                  <div className="admin-section-head">
                    <div>
                      <h3>打卡情况导出</h3>
                      <p>可按日期范围导出全部成员的明细与每日汇总。</p>
                    </div>
                  </div>

                  <div className="date-range-fields">
                    <label className="field">
                      <span>开始日期</span>
                      <input
                        type="date"
                        value={exportRange.from}
                        onChange={(event) =>
                          setExportRange((current) => ({
                            ...current,
                            from: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>结束日期</span>
                      <input
                        type="date"
                        value={exportRange.to}
                        onChange={(event) =>
                          setExportRange((current) => ({
                            ...current,
                            to: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <button className="primary-button" type="button" onClick={handleExport}>
                    导出 Excel
                  </button>
                </section>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {participantCalendarTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setParticipantCalendarTarget(null)}
        >
          <section
            className="participant-calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${participantCalendarTarget.name} 打卡日历`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="section-kicker">人物月历</p>
                <h2>{participantCalendarTarget.name}</h2>
                <p className="participant-calendar-hint">绿色表示当天已完整打卡。</p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setParticipantCalendarTarget(null)}
              >
                关闭
              </button>
            </div>

            <div className="participant-calendar-header">
              <button
                className="calendar-nav-button"
                type="button"
                onClick={() => setParticipantCalendarMonth((current) => shiftMonth(current, -1))}
                aria-label="上一个月"
              >
                ‹
              </button>
              <strong>
                {participantCalendarYear}年{participantCalendarMonthNumber}月
              </strong>
              <button
                className="calendar-nav-button"
                type="button"
                onClick={() => setParticipantCalendarMonth((current) => shiftMonth(current, 1))}
                aria-label="下一个月"
              >
                ›
              </button>
            </div>

            {participantCalendarLoading ? (
              <div className="empty-state compact">
                <h3>加载中</h3>
                <p>正在读取这个人的打卡月历。</p>
              </div>
            ) : (
              <div className="participant-calendar-shell">
                <div className="participant-calendar-weekdays">
                  {WEEKDAY_LABELS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>
                <div className="participant-calendar-grid">
                  {participantCalendarDays.map((day) => {
                    const dayStatus = participantCalendarDayMap.get(day.dateKey);
                    const isComplete = day.inCurrentMonth && Boolean(dayStatus?.isComplete);
                    const progressText =
                      day.inCurrentMonth && dayStatus
                        ? `已完成 ${dayStatus.completionCount}/${dayStatus.totalCount}`
                        : "";

                    return (
                      <div
                        key={day.dateKey}
                        className={`participant-calendar-day ${
                          day.inCurrentMonth ? "" : "participant-calendar-day-outside"
                        } ${
                          isComplete
                            ? "participant-calendar-day-complete"
                            : "participant-calendar-day-incomplete"
                        } ${day.inCurrentMonth && day.isToday ? "participant-calendar-day-today" : ""}`}
                        data-progress={progressText}
                        title={progressText || undefined}
                      >
                        <span className="participant-calendar-day-number">{day.day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
