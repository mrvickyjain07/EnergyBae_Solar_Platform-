// GET /api/status — health check endpoint
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  res.status(200).json({
    geminiConfigured: hasGeminiKey,
    environmentMode: process.env.NODE_ENV || "production",
    supportedTariffs: ["LT I (Res)", "LT II (Comm)", "LT V (Agri)"],
    ocrEngine: "Gemini Vision Multimodal",
  });
}
