import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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
              text: `You are reading a thread color chart image. Extract ALL thread color codes visible in this image.

Thread codes look like:
- G followed by 3-4 digits: G532, G629, G711, G022
- 4-5 digits only: 5860, 9030, 9138, 9052
- O followed by 4 digits: O0555 or 00555

Return ONLY a JSON array of the codes you see, nothing else. Example: ["G532","G629","5860","9030"]
Read carefully from left to right, top to bottom. Include ALL codes visible.`,
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

    const content = response.choices[0]?.message?.content ?? "[]";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const codes: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    res.json({ codes });
  } catch (err) {
    console.error("OCR error:", err);
    res.status(500).json({ error: "Failed to analyze image" });
  }
});

export default router;
