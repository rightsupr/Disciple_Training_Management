import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import * as XLSX from "xlsx";

import {
  CHECKIN_ITEMS,
  CHECKIN_ITEM_META,
  CONTENT_FIELD_MAP,
  type CheckinItemKey,
  type DashboardData,
  type ImportPreviewResult,
  type ImportPreviewRow,
  type ParticipantCalendarData,
  type ParticipantCalendarDay,
  type ParticipantCard,
  type ParticipantSummary,
} from "@/lib/types";
import {
  formatRate,
  getDateKeysInMonth,
  getIsoTimestamp,
  getMonthEndDateKey,
  getMonthStartDateKey,
  getTodayDateKey,
  getWeekEndDateKey,
  getWeekStartDateKey,
  normalizeMonthKey,
  normalizeDateKey,
} from "@/lib/date";

type DatabaseHandle = Database.Database;

type ParticipantRow = {
  id: number;
  name: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

type ContentRow = {
  date: string;
  devotionText: string;
  dailyReadingText: string;
  weeklyTaskText: string;
  scriptureText: string;
};

const REST_CONTENT_TEXT = "休息";

declare global {
  var __discipleTrainingDb: DatabaseHandle | undefined;
}

function getDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH?.trim() || "./data/app.db";
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

function getNameInitial(name: string) {
  return name.trim().charAt(0) || "门";
}

function isRestContent(value: string) {
  return value.trim() === REST_CONTENT_TEXT;
}

function isRestItem(content: ContentRow, item: CheckinItemKey) {
  return isRestContent(content[CONTENT_FIELD_MAP[item]]);
}

function getRestItems(content: ContentRow) {
  return CHECKIN_ITEMS.filter((item) => isRestItem(content, item));
}

function isAvailableItem(content: ContentRow, item: CheckinItemKey) {
  return item === "dailyReading" || content[CONTENT_FIELD_MAP[item]].trim().length > 0;
}

function initializeDatabase() {
  const databasePath = getDatabasePath();
  const shouldSeedDemoData =
    !fs.existsSync(databasePath) && process.env.NODE_ENV !== "production";

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_contents (
      date TEXT PRIMARY KEY,
      devotion_text TEXT NOT NULL DEFAULT '',
      daily_reading_text TEXT NOT NULL DEFAULT '',
      weekly_task_text TEXT NOT NULL DEFAULT '',
      scripture_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      item_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(participant_id, date, item_type),
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );
  `);

  ensureDailyContentColumns(db);

  if (shouldSeedDemoData) {
    seedDemoData(db);
  }

  return db;
}

function ensureDailyContentColumns(db: DatabaseHandle) {
  const tableInfo = db
    .prepare(`
      PRAGMA table_info(daily_contents)
    `)
    .all() as Array<{ name: string }>;

  const existingColumns = new Set(tableInfo.map((column) => column.name));

  if (!existingColumns.has("daily_reading_text")) {
    db.exec(`
      ALTER TABLE daily_contents
      ADD COLUMN daily_reading_text TEXT NOT NULL DEFAULT ''
    `);
  }
}

function seedDemoData(db: DatabaseHandle) {
  const timestamp = getIsoTimestamp();
  const participantNames = ["门徒甲", "门徒乙", "门徒丙"];

  const insertParticipant = db.prepare(`
    INSERT INTO participants (name, is_active, created_at, updated_at)
    VALUES (?, 1, ?, ?)
  `);

  for (const name of participantNames) {
    insertParticipant.run(name, timestamp, timestamp);
  }

  const today = getTodayDateKey();

  db.prepare(`
    INSERT INTO daily_contents (
      date,
      devotion_text,
      daily_reading_text,
      weekly_task_text,
      scripture_text,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    today,
    "请在管理员后台导入正式灵修内容。当前为示例内容，方便本地预览页面效果。",
    "每日读经示例：阅读约翰福音第 3 章，并记录一句触动你的经文。",
    "本周任务示例：完成一章阅读并记录一条代祷事项。",
    "背经示例：腓立比书 4:6-7。",
    timestamp,
    timestamp,
  );
}

export function getDb() {
  if (!global.__discipleTrainingDb) {
    global.__discipleTrainingDb = initializeDatabase();
  }

  return global.__discipleTrainingDb;
}

function getContentRow(dateKey: string): ContentRow {
  const row = getDb()
    .prepare(`
      SELECT
        date,
        devotion_text AS devotionText,
        daily_reading_text AS dailyReadingText,
        weekly_task_text AS weeklyTaskText,
        scripture_text AS scriptureText
      FROM daily_contents
      WHERE date = ?
    `)
    .get(dateKey) as ContentRow | undefined;

  const weeklyTaskFallback = getDb()
    .prepare(`
      SELECT weekly_task_text AS weeklyTaskText
      FROM daily_contents
      WHERE date >= ? AND date <= ? AND trim(weekly_task_text) <> ''
      ORDER BY date ASC
      LIMIT 1
    `)
    .get(getWeekStartDateKey(dateKey), getWeekEndDateKey(dateKey)) as
    | { weeklyTaskText: string }
    | undefined;

  return (
    row
      ? {
          ...row,
          weeklyTaskText: row.weeklyTaskText || weeklyTaskFallback?.weeklyTaskText || "",
        }
      : {
          date: dateKey,
          devotionText: "",
          dailyReadingText: "",
          weeklyTaskText: weeklyTaskFallback?.weeklyTaskText || "",
          scriptureText: "",
        }
  );
}

function buildSummaryMetric(
  key: CheckinItemKey,
  label: string,
  completed: number,
  total: number,
  enabled: boolean,
) {
  return {
    key,
    label,
    completed,
    total,
    rate: total > 0 ? completed / total : 0,
    enabled,
  };
}

export function getDashboardData(dateInput: string): DashboardData {
  const dateKey = normalizeDateKey(dateInput) || getTodayDateKey();
  const weekStartDateKey = getWeekStartDateKey(dateKey);
  const weekEndDateKey = getWeekEndDateKey(dateKey);
  const content = getContentRow(dateKey);
  const db = getDb();

  const participantRows = db
    .prepare(`
      SELECT
        id,
        name,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM participants
      WHERE is_active = 1
      ORDER BY id ASC
    `)
    .all() as ParticipantRow[];

  const checkins = db
    .prepare(`
      SELECT participant_id AS participantId, item_type AS itemType
      FROM checkins
      WHERE
        (item_type = 'weeklyTask' AND date >= ? AND date <= ?)
        OR
        (item_type != 'weeklyTask' AND date = ?)
    `)
    .all(weekStartDateKey, weekEndDateKey, dateKey) as Array<{
    participantId: number;
    itemType: CheckinItemKey;
  }>;

  const activeItems = CHECKIN_ITEMS.filter((item) => isAvailableItem(content, item));
  const restItems = getRestItems(content);
  const restItemSet = new Set(restItems);
  const checkinSet = new Set(
    checkins.map((checkin) => `${checkin.participantId}:${checkin.itemType}`),
  );

  const participants: ParticipantCard[] = participantRows.map((participant) => {
    const statuses = Object.fromEntries(
      CHECKIN_ITEMS.map((item) => [
        item,
        restItemSet.has(item) || checkinSet.has(`${participant.id}:${item}`),
      ]),
    ) as Record<CheckinItemKey, boolean>;

    const completionCount = CHECKIN_ITEMS.reduce(
      (count, item) => count + (statuses[item] ? 1 : 0),
      0,
    );

    return {
      id: participant.id,
      name: participant.name,
      initials: getNameInitial(participant.name),
      statuses,
      completionCount,
      completionRate: completionCount / CHECKIN_ITEMS.length,
    };
  });

  const devotionCompleted = participants.filter(
    (participant) => participant.statuses.devotion,
  ).length;
  const dailyReadingCompleted = participants.filter(
    (participant) => participant.statuses.dailyReading,
  ).length;
  const weeklyTaskCompleted = participants.filter(
    (participant) => participant.statuses.weeklyTask,
  ).length;
  const scriptureCompleted = participants.filter(
    (participant) => participant.statuses.scripture,
  ).length;

  return {
    date: dateKey,
    todayKey: getTodayDateKey(),
    content,
    availableItems: activeItems,
    restItems,
    participants,
    summary: {
      devotion: buildSummaryMetric(
        "devotion",
        CHECKIN_ITEM_META.devotion.label,
        devotionCompleted,
        content.devotionText.trim() ? participants.length : 0,
        content.devotionText.trim().length > 0,
      ),
      dailyReading: buildSummaryMetric(
        "dailyReading",
        CHECKIN_ITEM_META.dailyReading.label,
        dailyReadingCompleted,
        participants.length,
        true,
      ),
      weeklyTask: buildSummaryMetric(
        "weeklyTask",
        CHECKIN_ITEM_META.weeklyTask.label,
        weeklyTaskCompleted,
        content.weeklyTaskText.trim() ? participants.length : 0,
        content.weeklyTaskText.trim().length > 0,
      ),
      scripture: buildSummaryMetric(
        "scripture",
        CHECKIN_ITEM_META.scripture.label,
        scriptureCompleted,
        content.scriptureText.trim() ? participants.length : 0,
        content.scriptureText.trim().length > 0,
      ),
    },
  };
}

export function listParticipants() {
  const rows = getDb()
    .prepare(`
      SELECT
        id,
        name,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM participants
      ORDER BY is_active DESC, id ASC
    `)
    .all() as ParticipantRow[];

  return rows.map<ParticipantSummary>((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function createParticipant(nameInput: string) {
  const name = nameInput.trim().replace(/\s+/g, " ");

  if (!name) {
    throw new Error("请输入参与人员姓名。");
  }

  const db = getDb();
  const existing = db
    .prepare(`
      SELECT
        id,
        name,
        is_active AS isActive
      FROM participants
      WHERE name = ?
    `)
    .get(name) as { id: number; name: string; isActive: number } | undefined;

  const timestamp = getIsoTimestamp();

  if (existing?.isActive) {
    throw new Error("该参与人员已存在。");
  }

  if (existing) {
    db.prepare(`
      UPDATE participants
      SET is_active = 1, updated_at = ?
      WHERE id = ?
    `).run(timestamp, existing.id);

    return {
      restored: true,
      participants: listParticipants(),
    };
  }

  db.prepare(`
    INSERT INTO participants (name, is_active, created_at, updated_at)
    VALUES (?, 1, ?, ?)
  `).run(name, timestamp, timestamp);

  return {
    restored: false,
    participants: listParticipants(),
  };
}

export function setParticipantActiveState(participantId: number, isActive: boolean) {
  const db = getDb();
  const result = db
    .prepare(`
      UPDATE participants
      SET is_active = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(isActive ? 1 : 0, getIsoTimestamp(), participantId);

  if (result.changes === 0) {
    throw new Error("没有找到对应的参与人员。");
  }

  return listParticipants();
}

export function deleteParticipant(participantId: number) {
  const db = getDb();
  const result = db
    .prepare(`
      DELETE FROM participants
      WHERE id = ?
    `)
    .run(participantId);

  if (result.changes === 0) {
    throw new Error("没有找到对应的参与人员。");
  }

  return listParticipants();
}

export function getParticipantCalendarData(participantId: number, monthInput: string) {
  const monthKey = normalizeMonthKey(monthInput);

  if (!monthKey) {
    throw new Error("月份格式无效。");
  }

  const db = getDb();
  const participant = db
    .prepare(`
      SELECT id, name
      FROM participants
      WHERE id = ?
    `)
    .get(participantId) as { id: number; name: string } | undefined;

  if (!participant) {
    throw new Error("没有找到对应的参与人员。");
  }

  const monthStartDateKey = getMonthStartDateKey(monthKey);
  const monthEndDateKey = getMonthEndDateKey(monthKey);
  const weeklyRangeStart = getWeekStartDateKey(monthStartDateKey);
  const weeklyRangeEnd = getWeekEndDateKey(monthEndDateKey);

  const checkins = db
    .prepare(`
      SELECT date, item_type AS itemType
      FROM checkins
      WHERE participant_id = ? AND date >= ? AND date <= ?
    `)
    .all(participantId, weeklyRangeStart, weeklyRangeEnd) as Array<{
    date: string;
    itemType: CheckinItemKey;
  }>;

  const dailyCheckinSet = new Set(
    checkins
      .filter((checkin) => checkin.itemType !== "weeklyTask")
      .map((checkin) => `${checkin.date}:${checkin.itemType}`),
  );
  const weeklyTaskWeekStarts = new Set(
    checkins
      .filter((checkin) => checkin.itemType === "weeklyTask")
      .map((checkin) => checkin.date),
  );

  const days: ParticipantCalendarDay[] = getDateKeysInMonth(monthKey).map((dateKey) => {
    const content = getContentRow(dateKey);
    const restItemSet = new Set(getRestItems(content));
    const isWeeklyTaskComplete =
      restItemSet.has("weeklyTask") || weeklyTaskWeekStarts.has(getWeekStartDateKey(dateKey));
    const isDailyComplete = (["devotion", "dailyReading", "scripture"] as const).every((item) => {
      return restItemSet.has(item) || dailyCheckinSet.has(`${dateKey}:${item}`);
    });
    const completionCount = CHECKIN_ITEMS.reduce((count, item) => {
      if (item === "weeklyTask") {
        return count + (isWeeklyTaskComplete ? 1 : 0);
      }

      return count + (restItemSet.has(item) || dailyCheckinSet.has(`${dateKey}:${item}`) ? 1 : 0);
    }, 0);

    return {
      date: dateKey,
      completionCount,
      totalCount: CHECKIN_ITEMS.length,
      isDailyComplete,
      isComplete: completionCount === CHECKIN_ITEMS.length,
    };
  });

  return {
    participantId: participant.id,
    participantName: participant.name,
    monthKey,
    days,
  } satisfies ParticipantCalendarData;
}

export function toggleCheckin(
  dateInput: string,
  participantId: number,
  itemType: CheckinItemKey,
) {
  const dateKey = normalizeDateKey(dateInput);

  if (!dateKey) {
    throw new Error("日期格式无效。");
  }

  if (!CHECKIN_ITEMS.includes(itemType)) {
    throw new Error("打卡项目无效。");
  }

  const db = getDb();
  const weekStartDateKey = getWeekStartDateKey(dateKey);
  const weekEndDateKey = getWeekEndDateKey(dateKey);
  const participant = db
    .prepare(`
      SELECT id, is_active AS isActive
      FROM participants
      WHERE id = ?
    `)
    .get(participantId) as { id: number; isActive: number } | undefined;

  if (!participant || participant.isActive !== 1) {
    throw new Error("请选择有效的参与人员。");
  }

  const content = getContentRow(dateKey);
  const contentField = CONTENT_FIELD_MAP[itemType];

  if (isRestItem(content, itemType)) {
    throw new Error("这一项今日为休息，无需手动打卡。");
  }

  if (itemType !== "dailyReading" && !content[contentField].trim()) {
    throw new Error("管理员尚未上传这一项的内容。");
  }

  const timestamp = getIsoTimestamp();

  if (itemType === "weeklyTask") {
    const existingWeeklyCheckin = db
      .prepare(`
        SELECT id
        FROM checkins
        WHERE participant_id = ? AND item_type = 'weeklyTask' AND date >= ? AND date <= ?
        LIMIT 1
      `)
      .get(participantId, weekStartDateKey, weekEndDateKey) as { id: number } | undefined;

    if (existingWeeklyCheckin) {
      db.prepare(`
        DELETE FROM checkins
        WHERE participant_id = ? AND item_type = 'weeklyTask' AND date >= ? AND date <= ?
      `).run(participantId, weekStartDateKey, weekEndDateKey);
    } else {
      db.prepare(`
        INSERT INTO checkins (
          participant_id,
          date,
          item_type,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(participantId, weekStartDateKey, itemType, timestamp, timestamp);
    }
  } else {
    const existing = db
      .prepare(`
        SELECT id
        FROM checkins
        WHERE participant_id = ? AND date = ? AND item_type = ?
      `)
      .get(participantId, dateKey, itemType) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        DELETE FROM checkins
        WHERE id = ?
      `).run(existing.id);
    } else {
      db.prepare(`
        INSERT INTO checkins (
          participant_id,
          date,
          item_type,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(participantId, dateKey, itemType, timestamp, timestamp);
    }
  }

  return getDashboardData(dateKey);
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[_-]/g, "");
}

function normalizeTextCell(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeImportedDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }

    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(
      2,
      "0",
    )}`;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    const directMatch = normalizeDateKey(normalized);
    if (directMatch) {
      return directMatch;
    }

    const datePrefix = normalized.match(/^([^\sT]+)/)?.[1];
    const normalizedPrefix = normalizeDateKey(datePrefix);
    if (normalizedPrefix) {
      return normalizedPrefix;
    }

    const yearFirstMatch = normalized.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (yearFirstMatch) {
      const [, year, month, day] = yearFirstMatch;
      return `${year}-${String(Number(month)).padStart(2, "0")}-${String(
        Number(day),
      ).padStart(2, "0")}`;
    }

    const monthFirstMatch = normalized.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/);
    if (monthFirstMatch) {
      const [, month, day, yearFragment] = monthFirstMatch;
      const year =
        yearFragment.length === 2 ? String(2000 + Number(yearFragment)) : yearFragment;

      return `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(
        2,
        "0",
      )}`;
    }
  }

  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }

  return null;
}

function formatRawDatePreview(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `Excel日期序号 ${value} -> ${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
        parsed.d,
      ).padStart(2, "0")}`;
    }
  }

  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }

  return normalizeTextCell(value);
}

function getMappedCell(
  row: Map<string, unknown>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const value = row.get(normalizeHeader(alias));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

export function importDailyContents(fileBuffer: Buffer) {
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Excel 文件中没有可读取的工作表。");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: true,
  });

  if (rows.length === 0) {
    throw new Error("Excel 文件中没有数据。");
  }

  const parsedRows: Array<{
    rowNumber: number;
    rawDate: string;
    date: string;
    devotionText: string;
    dailyReadingText: string;
    weeklyTaskText: string;
    scriptureText: string;
  }> = [];

  rows.forEach((row, index) => {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(normalizeHeader(key), value);
    }

    const rawDate = getMappedCell(normalizedRow, ["日期", "date"]);
    const devotionText = normalizeTextCell(
      getMappedCell(normalizedRow, ["灵修内容", "每日灵修", "灵修", "devotion"]),
    );
    const dailyReadingText = normalizeTextCell(
      getMappedCell(normalizedRow, ["每日读经", "读经", "每日阅读", "dailyreading", "reading"]),
    );
    const scriptureText = normalizeTextCell(
      getMappedCell(normalizedRow, ["背经", "经文", "记忆经文", "scripture"]),
    );
    const weeklyTaskText = normalizeTextCell(
      getMappedCell(normalizedRow, ["周任务", "weeklytask", "任务"]),
    );

    const hasAnyValue =
      rawDate !== undefined ||
      devotionText.length > 0 ||
      dailyReadingText.length > 0 ||
      scriptureText.length > 0 ||
      weeklyTaskText.length > 0;

    if (!hasAnyValue) {
      return;
    }

    const date = normalizeImportedDate(rawDate);

    if (!date) {
      throw new Error(`第 ${index + 2} 行日期格式无效。`);
    }

    parsedRows.push({
      rowNumber: index + 2,
      rawDate: formatRawDatePreview(rawDate),
      date,
      devotionText,
      dailyReadingText,
      weeklyTaskText,
      scriptureText,
    });
  });

  if (parsedRows.length === 0) {
    throw new Error("没有解析到可导入的内容，请检查表头和数据。");
  }

  const timestamp = getIsoTimestamp();
  const db = getDb();
  const upsertStatement = db.prepare(`
    INSERT INTO daily_contents (
      date,
      devotion_text,
      daily_reading_text,
      weekly_task_text,
      scripture_text,
      created_at,
      updated_at
    ) VALUES (
      @date,
      @devotionText,
      @dailyReadingText,
      @weeklyTaskText,
      @scriptureText,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(date) DO UPDATE SET
      devotion_text = excluded.devotion_text,
      daily_reading_text = excluded.daily_reading_text,
      weekly_task_text = excluded.weekly_task_text,
      scripture_text = excluded.scripture_text,
      updated_at = excluded.updated_at
  `);

  db.transaction(() => {
    for (const row of parsedRows) {
      upsertStatement.run({
        ...row,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  })();

  return {
    count: parsedRows.length,
    dates: Array.from(new Set(parsedRows.map((row) => row.date))).sort(),
  };
}

export function previewDailyContentsImport(fileBuffer: Buffer): ImportPreviewResult {
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Excel 文件中没有可读取的工作表。");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: true,
  });

  if (rows.length === 0) {
    throw new Error("Excel 文件中没有数据。");
  }

  const previewRows: ImportPreviewRow[] = [];

  rows.forEach((row, index) => {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(normalizeHeader(key), value);
    }

    const rawDate = getMappedCell(normalizedRow, ["日期", "date"]);
    const devotionText = normalizeTextCell(
      getMappedCell(normalizedRow, ["灵修内容", "每日灵修", "灵修", "devotion"]),
    );
    const dailyReadingText = normalizeTextCell(
      getMappedCell(normalizedRow, ["每日读经", "读经", "每日阅读", "dailyreading", "reading"]),
    );
    const scriptureText = normalizeTextCell(
      getMappedCell(normalizedRow, ["背经", "经文", "记忆经文", "scripture"]),
    );
    const weeklyTaskText = normalizeTextCell(
      getMappedCell(normalizedRow, ["周任务", "weeklytask", "任务"]),
    );

    const hasAnyValue =
      rawDate !== undefined ||
      devotionText.length > 0 ||
      dailyReadingText.length > 0 ||
      scriptureText.length > 0 ||
      weeklyTaskText.length > 0;

    if (!hasAnyValue) {
      return;
    }

    const parsedDate = normalizeImportedDate(rawDate);

    if (!parsedDate) {
      throw new Error(`第 ${index + 2} 行日期格式无效。`);
    }

    previewRows.push({
      rowNumber: index + 2,
      rawDate: formatRawDatePreview(rawDate),
      parsedDate,
      devotionText,
      dailyReadingText,
      scriptureText,
      weeklyTaskText,
    });
  });

  if (previewRows.length === 0) {
    throw new Error("没有解析到可导入的内容，请检查表头和数据。");
  }

  return {
    count: previewRows.length,
    dates: Array.from(new Set(previewRows.map((row) => row.parsedDate))).sort(),
    rows: previewRows,
  };
}

export function buildExportWorkbook(from?: string, to?: string) {
  const normalizedFrom = from ? normalizeDateKey(from) : null;
  const normalizedTo = to ? normalizeDateKey(to) : null;

  if (from && !normalizedFrom) {
    throw new Error("导出开始日期格式无效。");
  }

  if (to && !normalizedTo) {
    throw new Error("导出结束日期格式无效。");
  }

  const whereClauses: string[] = [];
  const params: string[] = [];

  if (normalizedFrom) {
    whereClauses.push("date >= ?");
    params.push(normalizedFrom);
  }

  if (normalizedTo) {
    whereClauses.push("date <= ?");
    params.push(normalizedTo);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const dateRows = getDb()
    .prepare(`
      SELECT date
      FROM daily_contents
      ${whereSql}
      ORDER BY date ASC
    `)
    .all(...params) as Array<{ date: string }>;

  const detailRows: Array<Record<string, string | number>> = [];
  const summaryRows: Array<Record<string, string | number>> = [];

  for (const { date } of dateRows) {
    const dashboard = getDashboardData(date);
    const content = dashboard.content;

    summaryRows.push({
      日期: date,
      参与人数: dashboard.participants.length,
      每日灵修: dashboard.summary.devotion.enabled
        ? `${dashboard.summary.devotion.completed}/${dashboard.summary.devotion.total}`
        : "未上传",
      每日读经: dashboard.summary.dailyReading.enabled
        ? `${dashboard.summary.dailyReading.completed}/${dashboard.summary.dailyReading.total}`
        : "未上传",
      周任务: dashboard.summary.weeklyTask.enabled
        ? `${dashboard.summary.weeklyTask.completed}/${dashboard.summary.weeklyTask.total}`
        : "未上传",
      背经: dashboard.summary.scripture.enabled
        ? `${dashboard.summary.scripture.completed}/${dashboard.summary.scripture.total}`
        : "未上传",
    });

    for (const participant of dashboard.participants) {
      detailRows.push({
        日期: date,
        姓名: participant.name,
        每日灵修内容: content.devotionText,
        每日读经内容: content.dailyReadingText,
        周任务内容: content.weeklyTaskText,
        背经内容: content.scriptureText,
        每日灵修: participant.statuses.devotion ? "已完成" : "未完成",
        每日读经: participant.statuses.dailyReading ? "已完成" : "未完成",
        周任务: participant.statuses.weeklyTask ? "已完成" : "未完成",
        背经: participant.statuses.scripture ? "已完成" : "未完成",
        完成率: formatRate(participant.completionRate),
      });
    }
  }

  const workbook = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet(
    detailRows.length > 0 ? detailRows : [{ 提示: "当前日期范围内没有可导出的打卡记录。" }],
  );
  const summarySheet = XLSX.utils.json_to_sheet(
    summaryRows.length > 0 ? summaryRows : [{ 提示: "当前日期范围内没有可导出的汇总数据。" }],
  );

  detailSheet["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 40 },
    { wch: 40 },
    { wch: 40 },
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  summarySheet["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(workbook, detailSheet, "打卡记录");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "每日汇总");

  return XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });
}
