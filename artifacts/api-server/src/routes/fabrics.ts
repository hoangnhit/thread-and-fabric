import { Router } from "express";
import { db, fabricsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/fabrics", async (_req, res) => {
  try {
    const rows = await db.select().from(fabricsTable).orderBy(fabricsTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch fabrics" });
  }
});

router.post("/fabrics", async (req, res) => {
  const { name, image } = req.body;
  if (!name || !image) {
    res.status(400).json({ error: "name and image are required" });
    return;
  }
  try {
    const [row] = await db.insert(fabricsTable).values({ name, image }).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create fabric" });
  }
});

router.put("/fabrics/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const [row] = await db.update(fabricsTable).set({ name }).where(eq(fabricsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update fabric" });
  }
});

router.delete("/fabrics/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.delete(fabricsTable).where(eq(fabricsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete fabric" });
  }
});

export default router;
