export const CHECKIN_ITEMS = [
  "devotion",
  "dailyReading",
  "weeklyTask",
  "scripture",
] as const;

export type CheckinItemKey = (typeof CHECKIN_ITEMS)[number];

export interface DailyContent {
  date: string;
  devotionText: string;
  dailyReadingText: string;
  weeklyTaskText: string;
  scriptureText: string;
}

export interface SummaryMetric {
  key: CheckinItemKey;
  label: string;
  completed: number;
  total: number;
  rate: number;
  enabled: boolean;
}

export interface DashboardSummary {
  devotion: SummaryMetric;
  dailyReading: SummaryMetric;
  weeklyTask: SummaryMetric;
  scripture: SummaryMetric;
}

export interface ParticipantCard {
  id: number;
  name: string;
  initials: string;
  statuses: Record<CheckinItemKey, boolean>;
  completionCount: number;
  completionRate: number;
}

export interface ParticipantSummary {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  date: string;
  todayKey: string;
  content: DailyContent;
  availableItems: CheckinItemKey[];
  restItems: CheckinItemKey[];
  participants: ParticipantCard[];
  summary: DashboardSummary;
}

export interface AdminSessionState {
  authenticated: boolean;
  username?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  rawDate: string;
  parsedDate: string;
  devotionText: string;
  dailyReadingText: string;
  scriptureText: string;
  weeklyTaskText: string;
}

export interface ImportPreviewResult {
  count: number;
  dates: string[];
  rows: ImportPreviewRow[];
}

export interface ParticipantCalendarDay {
  date: string;
  completionCount: number;
  totalCount: number;
  isDailyComplete: boolean;
  isComplete: boolean;
}

export interface ParticipantCalendarData {
  participantId: number;
  participantName: string;
  monthKey: string;
  days: ParticipantCalendarDay[];
}

export const CHECKIN_ITEM_META: Record<
  CheckinItemKey,
  {
    label: string;
    shortLabel: string;
    icon: string;
    hint: string;
  }
> = {
  devotion: {
    label: "每日灵修",
    shortLabel: "灵修",
    icon: "☀️",
    hint: "完成灵修后点击打卡",
  },
  dailyReading: {
    label: "每日读经",
    shortLabel: "读经",
    icon: "📖",
    hint: "完成每日读经后点击打卡",
  },
  weeklyTask: {
    label: "周任务",
    shortLabel: "周任务",
    icon: "📚",
    hint: "完成本周任务后点击打卡",
  },
  scripture: {
    label: "背经",
    shortLabel: "背经",
    icon: "🕊",
    hint: "完成背经后点击打卡",
  },
};

export const CONTENT_FIELD_MAP: Record<CheckinItemKey, keyof DailyContent> = {
  devotion: "devotionText",
  dailyReading: "dailyReadingText",
  weeklyTask: "weeklyTaskText",
  scripture: "scriptureText",
};
