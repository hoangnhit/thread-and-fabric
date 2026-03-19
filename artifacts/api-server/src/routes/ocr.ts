import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface OcrColumn {
  label: string;
  codes: string[];
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
              text: `Read ALL thread codes from this GINGKO embroidery thread color chart photo.

The chart has 5 labeled columns (e.g. A-E or F-J or K-O), each with ~20 thread codes printed next to color swatches. Codes look like: G622, G529, 5860, 9030, 00344.

Read each column top-to-bottom. Return ONLY valid JSON, no markdown:
{"chart":"ae","columns":[{"label":"A","codes":["G622","G661","G561",...]},{"label":"B","codes":[...]},{"label":"C","codes":[...]},{"label":"D","codes":[...]},{"label":"E","codes":[...]}]}

Use "ae" for columns A-E, "fj" for F-J, "ko" for K-O.`,
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
      max_completion_tokens: 4096,
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
      columns: Array<{ label: string; codes: string[] }>;
    };

    const rawColumns = parsed.columns ?? [];
    const columns: OcrColumn[] = rawColumns.map(col => ({
      label: col.label ?? "",
      codes: (col.codes ?? [])
        .filter(c => typeof c === "string" && c.trim().length > 0)
        .map(c => c.trim()),
    }));

    const codes = columns.flatMap(col => col.codes);

    res.json({ chart: parsed.chart ?? "unknown", columns, codes } as OcrResult);
  } catch (err) {
    console.error("OCR error:", err);
    res.status(500).json({ error: "Failed to analyze image", codes: [], columns: [], chart: "unknown" });
  }
});

export default router;
