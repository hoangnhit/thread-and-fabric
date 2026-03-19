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
  chart: "fj" | "ko" | "unknown";
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
              text: `You are reading a Vietnamese embroidery thread color chart image. Extract ALL thread color codes visible.

Thread codes look like:
- G followed by 3-4 digits: G532, G629, G711, G022
- 4-5 digits only: 5860, 9030, 9138, 9052
- Starting with 00: 00555

The chart has 5 vertical columns with a letter header (F,G,H,I,J for the FJ chart, or K,L,M,N,O for the KO chart).
Each column has about 20 color swatches with a code label, arranged top to bottom.

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{
  "chart": "ko",
  "columns": [
    {"label": "K", "codes": ["G692","9138",...all 20 codes top to bottom]},
    {"label": "L", "codes": ["G647","G845",...all 20 codes top to bottom]},
    {"label": "M", "codes": ["G541","G940",...all 20 codes top to bottom]},
    {"label": "N", "codes": ["G920","G552",...all 20 codes top to bottom]},
    {"label": "O", "codes": ["G578","G668",...all 20 codes top to bottom]}
  ]
}

Use "fj" if the column headers are F,G,H,I,J. Use "ko" if headers are K,L,M,N,O. Use "unknown" if unclear.
Read EVERY code carefully. Each column must have exactly 20 codes.`,
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
      res.json({ chart: "unknown", columns: [], codes: [] } as OcrResult);
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { chart: string; columns: OcrColumn[] };
    const columns: OcrColumn[] = parsed.columns ?? [];
    const codes = columns.flatMap(col => col.codes);

    const result: OcrResult = {
      chart: (parsed.chart === "fj" || parsed.chart === "ko") ? parsed.chart : "unknown",
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
