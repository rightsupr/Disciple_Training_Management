const DEFAULT_TIMEZONE = "Asia/Shanghai";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

function parseNormalizedDateKey(dateKey: string) {
  const normalized = normalizeDateKey(dateKey);

  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return {
    normalized,
    year,
    month,
    day,
  };
}

function parseNormalizedMonthKey(monthKey: string) {
  const normalized = monthKey.trim().replace(/[./]/g, "-").replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const [, year, month] = match;
  return {
    year: Number(year),
    month: Number(month),
  };
}

export function getAppTimezone() {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

function getZonedParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: getAppTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);

  return { year, month, day };
}

export function getTodayDateKey(referenceDate = new Date()) {
  const { year, month, day } = getZonedParts(referenceDate);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function normalizeDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[./]/g, "-")
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "");

  let match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    const [, year, month, day] = match;
    return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  }

  match = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function shiftDateKey(dateKey: string, deltaDays: number) {
  const parsed = parseNormalizedDateKey(dateKey);

  if (!parsed) {
    return getTodayDateKey();
  }

  const { year, month, day } = parsed;
  const utcDate = new Date(Date.UTC(year, month - 1, day + deltaDays));

  return formatUtcDateKey(utcDate);
}

export function getWeekStartDateKey(dateKey: string) {
  const parsed = parseNormalizedDateKey(dateKey);

  if (!parsed) {
    return getTodayDateKey();
  }

  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const weekday = utcDate.getUTCDay();
  const deltaToMonday = weekday === 0 ? -6 : 1 - weekday;
  utcDate.setUTCDate(utcDate.getUTCDate() + deltaToMonday);

  return formatUtcDateKey(utcDate);
}

export function getWeekEndDateKey(dateKey: string) {
  return shiftDateKey(getWeekStartDateKey(dateKey), 6);
}

export function normalizeMonthKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = parseNormalizedMonthKey(value);

  if (!parsed || parsed.month < 1 || parsed.month > 12) {
    return null;
  }

  return `${parsed.year}-${pad(parsed.month)}`;
}

export function getMonthKeyFromDateKey(dateKey: string) {
  const parsed = parseNormalizedDateKey(dateKey);

  if (!parsed) {
    return getMonthKeyFromDateKey(getTodayDateKey());
  }

  return `${parsed.year}-${pad(parsed.month)}`;
}

export function getMonthStartDateKey(monthKey: string) {
  const normalized = normalizeMonthKey(monthKey);

  if (!normalized) {
    return `${getMonthKeyFromDateKey(getTodayDateKey())}-01`;
  }

  return `${normalized}-01`;
}

export function getMonthEndDateKey(monthKey: string) {
  const normalized = normalizeMonthKey(monthKey);

  if (!normalized) {
    return getMonthEndDateKey(getMonthKeyFromDateKey(getTodayDateKey()));
  }

  const [year, month] = normalized.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month, 0));

  return formatUtcDateKey(utcDate);
}

export function getDateKeysInMonth(monthKey: string) {
  const startDateKey = getMonthStartDateKey(monthKey);
  const endDateKey = getMonthEndDateKey(monthKey);
  const dates: string[] = [];

  let currentDateKey = startDateKey;

  while (currentDateKey <= endDateKey) {
    dates.push(currentDateKey);
    currentDateKey = shiftDateKey(currentDateKey, 1);
  }

  return dates;
}

export function formatChineseDateLabel(dateKey: string, todayKey: string) {
  const normalized = normalizeDateKey(dateKey);

  if (!normalized) {
    return "日期无效";
  }

  const [, month, day] = normalized.split("-");
  return `${Number(month)}月${Number(day)}日${normalized === todayKey ? "（今日）" : ""}`;
}

export function formatRate(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

export function getIsoTimestamp() {
  return new Date().toISOString();
}
