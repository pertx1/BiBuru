import type { ComponentType } from "react";
import { FinanceSummaryWidget } from "./widgets/finance-summary";
import { ProfitWidget, SalesWidget } from "./widgets/kpi";
import { AgendaTodayWidget, GoalsActiveWidget, InboxWidget, QuickCaptureWidget, TasksTodayWidget, VideosToWatchWidget } from "./widgets/simple";
import { BusinessCompareWidget, ExpensesCategoryWidget, OrdersWidget } from "./widgets/business2";
import { TasksBusinessWidget, TasksNoDateWidget, TasksDoneWeekWidget, TasksOverdueWidget, TasksWeekWidget } from "./widgets/tasks2";
import { MonthCalendarWidget, NextEventWidget, WeekGlanceWidget } from "./widgets/calendar2";
import { GoalDeadlineWidget, GoalRingWidget, GoalTrendWidget } from "./widgets/goals2";
import { FolderShortcutWidget, NotesPinnedWidget, NotesRecentWidget, VideoIdeasWidget, VideosCategoryWidget, VideosRecentWidget, VideosTopWidget } from "./widgets/notes-videos";
import { AiAskWidget, AiBriefWidget, AiSuggestWidget, AiUsageWidget } from "./widgets/ai";
import { NewsBusinessWidget, NewsIdeaWidget, NewsTodayWidget } from "./widgets/news";
import { PendingReceivablesWidget } from "./widgets/receivables";
import { StockMissingWidget } from "./widgets/stock";
import { MailUnreadWidget } from "./widgets/mail";
import { AntolaRulesWidget, InvoicesLatestWidget, OrdersStatusWidget, PrintBagWidget, SalesMonthlyWidget, StockSummaryWidget, TopProductsWidget } from "./widgets/business3";
import { ReviewTodayWidget } from "./widgets/review";
import { SocialBestPostWidget, SocialFollowersWidget, SocialInboxWidget, SocialUpcomingWidget } from "./widgets/social";
import type { WidgetProps } from "./types";

/**
 * Componente de cada tipo de widget (los metadatos están en `src/lib/home/layout.ts`).
 * Añadir un widget = crear su componente y darlo de alta aquí y en WIDGETS. Cada uno carga sus propios datos.
 */
export const WIDGET_COMPONENTS: Record<string, ComponentType<WidgetProps>> = {
  "finance-summary": FinanceSummaryWidget,
  sales: SalesWidget,
  profit: ProfitWidget,
  "tasks-today": TasksTodayWidget,
  "agenda-today": AgendaTodayWidget,
  "quick-capture": QuickCaptureWidget,
  "goals-active": GoalsActiveWidget,
  inbox: InboxWidget,
  "videos-to-watch": VideosToWatchWidget,
  "expenses-category": ExpensesCategoryWidget,
  orders: OrdersWidget,
  "pending-receivables": PendingReceivablesWidget,
  "stock-missing": StockMissingWidget,
  "business-compare": BusinessCompareWidget,
  "tasks-nodate": TasksNoDateWidget,
  "review-today": ReviewTodayWidget,
  "tasks-overdue": TasksOverdueWidget,
  "tasks-week": TasksWeekWidget,
  "tasks-business": TasksBusinessWidget,
  "tasks-done-week": TasksDoneWeekWidget,
  "next-event": NextEventWidget,
  "month-calendar": MonthCalendarWidget,
  "week-glance": WeekGlanceWidget,
  "goal-ring": GoalRingWidget,
  "goal-deadline": GoalDeadlineWidget,
  "goal-trend": GoalTrendWidget,
  "notes-pinned": NotesPinnedWidget,
  "notes-recent": NotesRecentWidget,
  "folder-shortcut": FolderShortcutWidget,
  "videos-top": VideosTopWidget,
  "video-ideas": VideoIdeasWidget,
  "videos-recent": VideosRecentWidget,
  "videos-category": VideosCategoryWidget,
  "news-today": NewsTodayWidget,
  "news-idea": NewsIdeaWidget,
  "news-business": NewsBusinessWidget,
  "mail-unread": MailUnreadWidget,
  "social-followers": SocialFollowersWidget,
  "social-best": SocialBestPostWidget,
  "social-upcoming": SocialUpcomingWidget,
  "social-inbox": SocialInboxWidget,
  "sales-monthly": SalesMonthlyWidget,
  "orders-status": OrdersStatusWidget,
  "top-products": TopProductsWidget,
  "stock-summary": StockSummaryWidget,
  "print-bag": PrintBagWidget,
  "invoices-latest": InvoicesLatestWidget,
  "antola-rules": AntolaRulesWidget,
  "ai-ask": AiAskWidget,
  "ai-brief": AiBriefWidget,
  "ai-usage": AiUsageWidget,
  "ai-suggest": AiSuggestWidget,
};
