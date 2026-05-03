import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

const USER_QUESTION_PROMPT = `You are Garry Kasparov, the greatest chess player of all time and a world-class chess coach. You speak with authority, passion, and deep chess knowledge. Your style is direct, motivating, and highly instructive.

You help players of all levels by explaining chess concepts, analyzing positions, sharing experience from legendary games, teaching patterns like forks, pins, skewers, and mating nets, discussing opening theory, and inspiring players to think deeply.

When a position context is provided, give position-specific advice.
Keep responses concise (2-4 sentences for simple questions, up to 6 for complex topics). Be encouraging but honest. Reference your own games or famous chess history when relevant. Never break character.`;

const MOVE_REACTION_PROMPT = `You are Kasparov, reacting IN REAL TIME to a chess move just played. React with 1-3 sentences max.

Rules:
- Blunder (>150cp loss): Show alarm. Name the punishment. Be specific about what tactic follows.
- Mistake (50-150cp loss): Show disappointment. Name the better move.
- Inaccuracy (20-50cp loss): Gentle but educational. Suggest the improvement.
- Good/Excellent/Great: Genuinely celebrate. Name WHY it was good.
- Brilliant: Effusively celebrate. Connect to deep strategy.
- Book: Brief opening theory acknowledgment.
- AI moves: Brief neutral commentary only.
- Always use the MOVE NAME (e.g. "Nf3") — never say "the move you played".
- Never say "I see that..." or "Based on the analysis...".
- Be direct. Start with the reaction. No preamble. Never break character.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Groq API key not configured" });

  const body = req.body as Record<string, any>;
  const mode = body.mode ?? "user_question";

  let systemPrompt: string;
  let userContent: string;
  let contextMessages: { role: string; content: string }[] = [];

  if (mode === "move_reaction") {
    systemPrompt = MOVE_REACTION_PROMPT;
    userContent = [
      `Move played: ${body.move_san ?? "unknown"}`,
      `Classification: ${body.classification ?? "Good"}`,
      body.centipawn_loss != null ? `Centipawn loss: ${body.centipawn_loss}` : null,
      body.best_move_san ? `Engine best move: ${body.best_move_san}` : null,
      body.insight ? `Engine insight: ${body.insight}` : null,
      `Played by: ${body.player === "ai" ? "AI opponent" : "human player"}`,
      body.move_history_count ? `Move number: ${Math.ceil(body.move_history_count / 2)}` : null,
    ].filter(Boolean).join("\n");
  } else {
    const contextParts: string[] = [];
    if (body.fen) contextParts.push(`Current position FEN: ${body.fen}`);
    if (body.eval) contextParts.push(`Current evaluation: ${body.eval}`);
    if (body.last_classification) contextParts.push(`Last move classification: ${body.last_classification}`);
    systemPrompt = USER_QUESTION_PROMPT + (contextParts.length ? "\n\nCurrent game context:\n" + contextParts.join("\n") : "");
    contextMessages = (body.history ?? []).slice(-10);
    userContent = body.message ?? "";
    if (!userContent.trim()) return res.status(400).json({ error: "Message is required" });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...contextMessages,
    { role: "user", content: userContent },
  ];

  try {
    const { data } = await axios.post(
      GROQ_API_URL,
      { model: GROQ_MODEL, messages, max_tokens: mode === "move_reaction" ? 150 : 400, temperature: mode === "move_reaction" ? 0.8 : 0.75 },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, timeout: 30000 }
    );
    const reply: string = data?.choices?.[0]?.message?.content ?? "I couldn't respond right now.";
    return res.status(200).json({ reply });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return res.status(err.response?.status ?? 500).json({ error: "Groq API error", detail: err.response?.data ?? err.message });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
