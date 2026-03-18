import { Router } from "express";

const router = Router();

router.get("/proxy-image", async (req, res) => {
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "invalid url" }); return;
  }
  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GingkoBot/1.0)",
        "Accept": "image/*,*/*",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status}` }); return;
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buf);
  } catch (e: unknown) {
    res.status(502).json({ error: (e as Error).message });
  }
});

export default router;
