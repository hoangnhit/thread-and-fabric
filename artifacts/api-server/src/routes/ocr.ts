import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface OcrColumn {
  label: string;
  xPct: number;
  codes: string[];
}

export interface OcrResult {
  chart: "fj" | "ko" | "unknown";
  gridTopPct: number;
  gridBottomPct: number;
  columns: OcrColumn[];
  codes: string[];
}

router.post("/ocr-image", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body as { imageBase64: string; mimeType?: string };
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are analyzing a Vietnamese embroidery thread color chart image.

Thread codes look like: G followed by digits (G532, G629), digits only (5860, 9030), or starting with 00 (00555).

The chart has 5 vertical columns with letter headers:
- FJ chart: columns F, G, H, I, J
- KO chart: columns K, L, M, N, O

Each column has up to 20 color swatches with a small white label showing the code, arranged top to bottom.

IMPORTANT: Also estimate the SPATIAL LAYOUT of the chart in this image:
- gridTopPct: the Y position (as fraction 0.0-1.0 of image height) where the FIRST ROW of labels starts
- gridBottomPct: the Y position where the LAST ROW of labels ends
- For each column, xPct: the X center position (as fraction 0.0-1.0 of image width) of that column's labels

Return ONLY a JSON object (no markdown):
{
  "chart": "ko",
  "gridTopPct": 0.08,
  "gridBottomPct": 0.94,
  "columns": [
    {"label": "K", "xPct": 0.08, "codes": ["G692","9138",...up to 20 codes, use "" for invisible ones]},
    {"label": "L", "xPct": 0.25, "codes": ["G647","G845",...up to 20 codes]},
    {"label": "M", "xPct": 0.46, "codes": ["G541","G940",...up to 20 codes]},
    {"label": "N", "xPct": 0.65, "codes": ["G920","G552",...up to 20 codes]},
    {"label": "O", "xPct": 0.84, "codes": ["G578","G668",...up to 20 codes]}
  ]
}

Use "fj" for F-J columns, "ko" for K-O columns. Estimate spatial positions accurately.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content ?? "{}";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.json({ chart: "unknown", gridTopPct: 0.08, gridBottomPct: 0.94, columns: [], codes: [] } as OcrResult);
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      chart: string;
      gridTopPct?: number;
      gridBottomPct?: number;
      columns: Array<{ label: string; xPct?: number; codes: string[] }>;
    };

    const rawColumns = parsed.columns ?? [];
    const columns: OcrColumn[] = rawColumns.map(col => ({
      label: col.label,
      xPct: typeof col.xPct === "number" ? col.xPct : 0.1,
      codes: col.codes.map(c => (typeof c === "string" ? c.trim() : "")),
    }));

    const codes = columns.flatMap(col => col.codes).filter(c => c.length > 0);

    const result: OcrResult = {
      chart: (parsed.chart === "fj" || parsed.chart === "ko") ? parsed.chart : "unknown",
      gridTopPct: typeof parsed.gridTopPct === "number" ? parsed.gridTopPct : 0.08,
      gridBottomPct: typeof parsed.gridBottomPct === "number" ? parsed.gridBottomPct : 0.94,
      columns,
      codes,
    };

    res.json(result);
  } catch (err) {
    console.error("OCR error:", err);
    res.status(500).json({ error: "Failed to analyze image", codes: [], columns: [], chart: "unknown", gridTopPct: 0.08, gridBottomPct: 0.94 });
  }
});

export default router;
