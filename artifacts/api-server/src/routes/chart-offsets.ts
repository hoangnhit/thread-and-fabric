import { Router } from "express";
import { db, chartOffsetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type OffsetMap = Record<string, { dx: number; dy: number }>;

const router = Router();

router.get("/chart-offsets/:chartId", async (req, res) => {
  const chartId = req.params.chartId;
  if (!chartId) {
    res.status(400).json({ error: "chartId is required" });
    return;
  }
  try {
    const rows = await db.select().from(chartOffsetsTable).where(eq(chartOffsetsTable.chartId, chartId));
    const offsets: OffsetMap = {};
    for (const row of rows) {
      offsets[row.badgeKey] = { dx: Number(row.dx), dy: Number(row.dy) };
    }
    res.json({ chartId, offsets });
  } catch {
    res.status(500).json({ error: "Failed to fetch chart offsets" });
  }
});

router.put("/chart-offsets/:chartId", async (req, res) => {
  const chartId = req.params.chartId;
  const offsets = req.body?.offsets as OffsetMap | undefined;
  if (!chartId || !offsets || typeof offsets !== "object") {
    res.status(400).json({ error: "chartId and offsets are required" });
    return;
  }

  try {
    const entries = Object.entries(offsets)
      .filter(([, value]) => Number.isFinite(value?.dx) && Number.isFinite(value?.dy))
      .map(([badgeKey, value]) => ({
        chartId,
        badgeKey,
        dx: Number(value.dx),
        dy: Number(value.dy),
        updatedAt: new Date(),
      }));

    await db.transaction(async (tx) => {
      await tx.delete(chartOffsetsTable).where(eq(chartOffsetsTable.chartId, chartId));
      if (entries.length > 0) {
        await tx.insert(chartOffsetsTable).values(entries);
      }
    });

    res.json({ ok: true, chartId, count: entries.length });
  } catch {
    res.status(500).json({ error: "Failed to save chart offsets" });
  }
});

export default router;
