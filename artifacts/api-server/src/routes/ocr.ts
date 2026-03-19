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
  chart: "ae" | "fj" | "ko" | "unknown";
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
              text: `You are analyzing a GINGKO embroidery thread color chart image. Extract ALL thread color codes visible.

Thread codes look like: G followed by digits (G532, G629), digits only (5860, 9030), or starting with 00 (00344, 00555).

The chart has 5 vertical columns with letter headers. Identify which chart type:
- "ae" chart: columns A, B, C, D, E
- "fj" chart: columns F, G, H, I, J
- "ko" chart: columns K, L, M, N, O

Each column has up to 20 color swatches with a code label, arranged top to bottom.

CRITICAL: Estimate the EXACT spatial position of the code labels in this image:
- gridTopPct: Y position (fraction 0.0-1.0 of image height) where the CENTER of the FIRST ROW of labels is
- gridBottomPct: Y position where the CENTER of the LAST ROW of labels is
- For each column, xPct: the X CENTER position (fraction 0.0-1.0 of image width) of that column's code labels

Look carefully at where each label physically sits in the image and report accurate fractions.

Return ONLY a JSON object (no markdown, no explanation):
{
  "chart": "ae",
  "gridTopPct": 0.12,
  "gridBottomPct": 0.90,
  "columns": [
    {"label": "A", "xPct": 0.10, "codes": ["G622","G661",...all 20 codes top to bottom]},
    {"label": "B", "xPct": 0.28, "codes": [...]},
    {"label": "C", "xPct": 0.46, "codes": [...]},
    {"label": "D", "xPct": 0.64, "codes": [...]},
    {"label": "E", "xPct": 0.82, "codes": [...]}
  ]
}

Use "" for any code position that is not visible. Estimate xPct and gridTopPct/gridBottomPct as accurately as possible.`,
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
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    console.log("OCR raw response:", content.substring(0, 300));

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

    const validCharts = ["ae", "fj", "ko"];
    const result: OcrResult = {
      chart: validCharts.includes(parsed.chart) ? parsed.chart as OcrResult["chart"] : "unknown",
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
