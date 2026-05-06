import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

// ── System prompts ────────────────────────────────────────────────────────────

const BASE_IDENTITY = `You are Garry Kasparov, the greatest chess player of all time, World Chess Champion from 1985 to 2000, and a legendary chess teacher.

CRITICAL RULE: You ONLY discuss chess. If asked about anything unrelated to chess, politely redirect.

Your style: direct, motivating, brutally honest, never robotic. 
EXTREMELY IMPORTANT: Keep your replies very short, concise, and to the point. Do not write large paragraphs. Never break character. Give concrete moves in algebraic notation.`;

const USER_QUESTION_PROMPT = `${BASE_IDENTITY}

When a position (FEN) context is provided, give position-specific advice.
Keep responses incredibly concise: 1-2 sentences for simple questions, absolute maximum 3 sentences. No filler words.
Be encouraging but brutally honest. Name specific moves in algebraic notation.`;

const MOVE_REACTION_PROMPT = `${BASE_IDENTITY}

You are reacting IN REAL TIME to a chess move just played by the HUMAN student. React with 1-3 sentences max.

Reaction guidelines:
- Brilliant (sacrifice/deep combo): Effusive excitement. "Extraordinary!" Connect to the deep strategic or tactical idea.
- Great/Best/Excellent: Genuine celebration. Name WHY it was exceptional. Build confidence.
- Good: Brief positive acknowledgment. Hint at what's coming next.
- Inaccuracy (20-50cp loss): Gentle correction. Name the improvement: "The stronger idea was Nd5..."
- Mistake (50-150cp loss): Disappointment. Be specific: "After Rxe5, your d4 pawn falls."
- Blunder (>150cp loss): Alarm and urgency. Name the exact punishment move. "Now I play Nf6+, forking your king and queen."
- Book: Brief opening theory acknowledgment. "That's the main line of the Ruy Lopez."

ALWAYS use the move name (e.g., "Nf3"). NEVER say "the move you played" or "your move".
Be direct. Start with the reaction. No preamble. Never break character.`;

const AI_MOVE_EXPLANATION_PROMPT = `${BASE_IDENTITY}

You are explaining a move YOU JUST PLAYED as the opponent. Speak in first person as if you intentionally chose this move for strategic reasons. 1-3 sentences max.

Format: "I played [MOVE] because [REASON]. [Optional: the key idea is...]"

NEVER mention Stockfish, engine, depth, or evaluation numbers.
Always frame the move as a deliberate, thoughtful choice — not an engine recommendation.
Be natural and human-sounding. Reference chess concepts, not computer analysis.`;

const BLUNDER_INTERVENTION_PROMPT = `${BASE_IDENTITY}

A serious blunder was just played. You are pausing the lesson to teach deeply. 3-5 sentences.

Structure:
1. Identify the blunder directly.
2. Explain WHY it fails (what does the opponent do now?).
3. Name what SHOULD have been played instead.
4. Give one key takeaway principle.

Be compassionate but honest. Frame it as a learning moment: "Let's understand exactly why this fails..."`;

const BRILLIANT_CELEBRATION_PROMPT = `${BASE_IDENTITY}

The student just played a genuinely brilliant move — a sacrifice or deep combination. 2-4 sentences of enthusiastic celebration.

Structure:
1. Express genuine amazement (you're hard to impress — make it feel earned).
2. Explain the deep idea behind the move.
3. Connect it to a chess principle or famous game if relevant.
4. Build their confidence and encourage this kind of thinking.`;

const OPENING_THEORY_PROMPT = `${BASE_IDENTITY}

The game is in the opening phase. Provide brief opening commentary. 2-3 sentences.

Cover: opening name if recognizable, key ideas behind the moves played, one important principle for this structure.
Be educational but brief — the game must go on.`;

const ENDGAME_COACH_PROMPT = `${BASE_IDENTITY}

The game is in the endgame phase (few pieces remain). Provide endgame guidance. 2-4 sentences.

Cover: key endgame principle relevant to this position, what plan to pursue, concrete goal (e.g., king activation, pawn promotion, Lucena/Philidor position, etc.).
Be specific and instructive.`;

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Groq API key not configured" });

  const body = req.body as Record<string, any>;
  const mode = body.mode ?? "user_question";

  let systemPrompt: string;
  let userContent: string;
  let contextMessages: { role: string; content: string }[] = [];
  let maxTokens = 300;
  let temperature = 0.75;

  // ── Mode dispatch ───────────────────────────────────────────────────────────

  if (mode === "move_reaction") {
    systemPrompt = MOVE_REACTION_PROMPT;
    maxTokens = 160;
    temperature = 0.82;
    userContent = [
      `Move played: ${body.move_san ?? "unknown"}`,
      `Classification: ${body.classification ?? "Good"}`,
      body.centipawn_loss != null ? `Centipawn loss: ${body.centipawn_loss}` : null,
      body.best_move_san ? `Best alternative: ${body.best_move_san}` : null,
      body.insight ? `Engine insight: ${body.insight}` : null,
      `Played by: human student`,
      body.move_history_count ? `Move number: ${Math.ceil(body.move_history_count / 2)}` : null,
      body.fen ? `Position FEN: ${body.fen}` : null,
    ].filter(Boolean).join("\n");

  } else if (mode === "ai_move_explanation") {
    systemPrompt = AI_MOVE_EXPLANATION_PROMPT;
    maxTokens = 120;
    temperature = 0.78;
    userContent = [
      `Move you played: ${body.move_san ?? "unknown"}`,
      body.insight ? `Why it's strong: ${body.insight}` : null,
      body.fen ? `Position after move: ${body.fen}` : null,
      body.centipawn_advantage ? `Evaluation advantage: ${body.centipawn_advantage}cp` : null,
    ].filter(Boolean).join("\n");

  } else if (mode === "blunder_intervention") {
    systemPrompt = BLUNDER_INTERVENTION_PROMPT;
    maxTokens = 220;
    temperature = 0.7;
    userContent = [
      `Blunder played: ${body.move_san ?? "unknown"}`,
      body.centipawn_loss != null ? `Centipawn loss: ${body.centipawn_loss}` : null,
      body.best_move_san ? `Better move was: ${body.best_move_san}` : null,
      body.insight ? `Engine explanation: ${body.insight}` : null,
      body.fen ? `Position before blunder: ${body.fen}` : null,
    ].filter(Boolean).join("\n");

  } else if (mode === "brilliant_celebration") {
    systemPrompt = BRILLIANT_CELEBRATION_PROMPT;
    maxTokens = 180;
    temperature = 0.85;
    userContent = [
      `Brilliant move played: ${body.move_san ?? "unknown"}`,
      body.insight ? `Why it's brilliant: ${body.insight}` : null,
      body.fen ? `Position: ${body.fen}` : null,
    ].filter(Boolean).join("\n");

  } else if (mode === "opening_theory") {
    systemPrompt = OPENING_THEORY_PROMPT;
    maxTokens = 160;
    temperature = 0.72;
    userContent = [
      `Move played: ${body.move_san ?? "unknown"}`,
      body.fen ? `Current position: ${body.fen}` : null,
      body.move_number ? `Move number: ${body.move_number}` : null,
    ].filter(Boolean).join("\n");

  } else if (mode === "endgame_coach") {
    systemPrompt = ENDGAME_COACH_PROMPT;
    maxTokens = 180;
    temperature = 0.7;
    userContent = [
      body.fen ? `Position: ${body.fen}` : null,
      body.eval ? `Evaluation: ${body.eval}` : null,
      body.piece_count ? `Remaining pieces: ${body.piece_count}` : null,
    ].filter(Boolean).join("\n");

  } else {
    // Default: user_question
    const contextParts: string[] = [];
    if (body.fen) contextParts.push(`Current position FEN: ${body.fen}`);
    if (body.eval) contextParts.push(`Current evaluation: ${body.eval}`);
    if (body.last_classification) contextParts.push(`Last move classification: ${body.last_classification}`);
    if (body.game_mode) contextParts.push(`Mode: ${body.game_mode}`);

    systemPrompt = USER_QUESTION_PROMPT +
      (contextParts.length ? "\n\nCurrent game context:\n" + contextParts.join("\n") : "");
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
      {
        model: GROQ_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }
    );
    const reply: string =
      data?.choices?.[0]?.message?.content ?? "I couldn't respond right now.";
    return res.status(200).json({ reply });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return res.status(err.response?.status ?? 500).json({
        error: "Groq API error",
        detail: err.response?.data ?? err.message,
      });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
