import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface OcrCodeEntry {
  code: string;
  xPct: number;
  yPct: number;
}

export interface OcrColumn {
  label: string;
  entries: OcrCodeEntry[];
}

export interface OcrResult {
  chart: string;
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
              text: `Analyze this GINGKO embroidery thread color chart photo. Extract ALL thread codes and their EXACT pixel positions as fractions of image size.

Codes look like: G622, 5860, 9030, 00344. Chart has 5 vertical columns (A-E or F-J or K-O), ~20 rows each.

For each code: report its center position as xPct (0=left, 1=right) and yPct (0=top, 1=bottom). Be PRECISE - each code must align with the color swatch on its SAME row.

Return ONLY valid JSON, no markdown backticks:
{"chart":"ae","columns":[{"label":"A","entries":[{"code":"G622","xPct":0.05,"yPct":0.09},...]},{"label":"B","entries":[...]},{"label":"C","entries":[...]},{"label":"D","entries":[...]},{"label":"E","entries":[...]}]}

Use "ae" for A-E, "fj" for F-J, "ko" for K-O.`,
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
      max_completion_tokens: 16384,
    });

    const content = response.choices[0]?.message?.content ?? "";
    if (!content || content.trim().length === 0) {
      res.json({ chart: "unknown", columns: [], codes: [] } as OcrResult);
      return;
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.json({ chart: "unknown", columns: [], codes: [] } as OcrResult);
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      chart: string;
      columns: Array<{
        label: string;
        entries: Array<{ code: string; xPct?: number; yPct?: number }>;
      }>;
    };

    const rawColumns = parsed.columns ?? [];
    const columns: OcrColumn[] = rawColumns.map(col => ({
      label: col.label,
      entries: (col.entries ?? [])
        .filter(e => e.code && typeof e.code === "string" && e.code.trim().length > 0)
        .map(e => ({
          code: e.code.trim(),
          xPct: typeof e.xPct === "number" ? e.xPct : 0.1,
          yPct: typeof e.yPct === "number" ? e.yPct : 0.1,
        })),
    }));

    const codes = columns.flatMap(col => col.entries.map(e => e.code));

    const result: OcrResult = {
      chart: parsed.chart ?? "unknown",
      columns,
      codes,
    };

    res.json(result);
  } catch (err) {
    console.error("OCR error:", err);
    res.status(500).json({ error: "Failed to analyze image", codes: [], columns: [], chart: "unknown" });
  }
});

export default router;
