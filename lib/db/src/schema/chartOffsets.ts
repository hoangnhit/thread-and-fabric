import { pgTable, serial, text, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";

export const chartOffsetsTable = pgTable("chart_offsets", {
  id: serial("id").primaryKey(),
  chartId: text("chart_id").notNull(),
  badgeKey: text("badge_key").notNull(),
  dx: doublePrecision("dx").notNull(),
  dy: doublePrecision("dy").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  chartBadgeUnique: uniqueIndex("chart_offsets_chart_badge_unique").on(table.chartId, table.badgeKey),
}));

export type ChartOffset = typeof chartOffsetsTable.$inferSelect;
