import sys
import os
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local", override=True)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import (
    AnalyzeRequest, AnalyzeResponse,
    AnalyzeMoveRequest, MoveAnalysis,
    GameAnalysisRequest, GameAnalysisResponse,
    SaveGameRequest, HistoryGame, HistoryListResponse,
    ApiResponse,
)
from ai_service import AIService
from game_store import GameStore
import chess
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Chess Strategy Assistant API",
    description="Chess analysis powered by Stockfish engine",
    version="4.0.0",
)

_allowed_origin = os.getenv("ALLOWED_ORIGIN", "*")
_cors_origins = ["*"] if _allowed_origin == "*" else [_allowed_origin, "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_svc = AIService()
store = GameStore()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "engine": "stockfish",
        "stockfish_ready": ai_svc.is_ready(),
        "model": ai_svc.model,
    }


# ── Single-position analysis (existing) ──────────────────────────────────────

@app.post("/analyze", response_model=ApiResponse)
async def analyze_position(request: AnalyzeRequest):
    logger.info(f"Analyzing FEN: {request.fen}")
    try:
        board = chess.Board(request.fen)
        if not board.is_valid():
            raise ValueError("Invalid board state")
    except Exception:
        return ApiResponse.fail("Invalid FEN string provided.")

    if board.is_game_over():
        return ApiResponse.fail("The game is already over in this position.")

    if not list(board.legal_moves):
        return ApiResponse.fail("No legal moves available from this position.")

    try:
        result = await ai_svc.analyze_position(request.fen, depth=request.depth, skill_level=request.skill_level)
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return ApiResponse.fail(f"Analysis failed: {str(e)}")

    return ApiResponse.ok({
        "best_move": result.get("best_move", ""),
        "evaluation": result.get("evaluation", "0.00"),
        "explanation": result.get("explanation", ""),
        "top_moves": result.get("top_moves", []),
        "mate_in": result.get("mate_in"),
    })


# ── Per-move classification ───────────────────────────────────────────────────

@app.post("/analyze-move", response_model=ApiResponse)
async def analyze_move(request: AnalyzeMoveRequest):
    try:
        board = chess.Board(request.fen_before)
        move = chess.Move.from_uci(request.move_uci)
        if move not in board.legal_moves:
            raise ValueError("Illegal move")
    except Exception as exc:
        return ApiResponse.fail(f"Invalid input: {exc}")

    try:
        result = await ai_svc.analyze_move(
            fen_before=request.fen_before,
            move_uci=request.move_uci,
            ply=request.ply,
            depth=request.depth,
            skill_level=request.skill_level,
        )
    except Exception as e:
        logger.error(f"Move analysis error: {e}")
        return ApiResponse.fail(str(e))

    return ApiResponse.ok({
        "played_move": result.move_uci,
        "played_move_san": result.move_san,
        "best_move": result.best_move_uci,
        "best_move_san": result.best_move_san,
        "classification": result.classification,
        "eval_before": result.eval_before if result.eval_before is not None else 0.0,
        "eval_after": result.eval_after if result.eval_after is not None else 0.0,
        "centipawn_loss": result.centipawn_loss,
        "pv_line": result.pv_line or [],
        "insight": result.insight or "",
        "is_book": result.is_book,
        "is_brilliant": result.is_brilliant,
    })


# ── Full-game analysis ────────────────────────────────────────────────────────

@app.post("/analyze-game", response_model=ApiResponse)
async def analyze_game(request: GameAnalysisRequest):
    if not request.pgn.strip():
        return ApiResponse.fail("PGN cannot be empty.")
    try:
        analyses, summary = await ai_svc.analyze_game(request.pgn, depth=request.depth)
        return ApiResponse.ok({
            "moves": [m.model_dump() for m in analyses],
            "summary": summary.model_dump(),
        })
    except Exception as e:
        logger.error(f"Game analysis error: {e}")
        return ApiResponse.fail(str(e))


# ── History ───────────────────────────────────────────────────────────────────

@app.get("/history", response_model=HistoryListResponse)
async def get_history():
    games = store.list_games()
    return HistoryListResponse(games=games)


@app.get("/history/{game_id}", response_model=HistoryGame)
async def get_game(game_id: str):
    game = store.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    return game


@app.post("/history", response_model=HistoryGame)
async def save_game(request: SaveGameRequest):
    try:
        saved = store.save_game(
            pgn=request.pgn,
            result=request.result,
            moves=request.moves,
            summary=request.summary,
        )
    except Exception as e:
        logger.error(f"Save game error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return saved


# ── Challenges Mode ───────────────────────────────────────────────────────────

# ── Challenges Mode ───────────────────────────────────────────────────────────

import json
import asyncio
import httpx
from pydantic import BaseModel
import random
from challenge_generator import generate_puzzle_from_position, THEME_LABELS, THEME_DESCRIPTIONS

# Fallback static puzzles
STATIC_PUZZLES = []
try:
    with open("data/puzzles.json", "r") as f:
        STATIC_PUZZLES = json.load(f)
except Exception as e:
    logger.warning(f"Static puzzles not loaded: {e}")

@app.get("/challenge")
async def get_challenge(difficulty: str = "medium"):
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"
    if ai_svc._engine_ok:
        try:
            puzzle = await asyncio.get_running_loop().run_in_executor(
                None,
                lambda: generate_puzzle_from_position(ai_svc._sf.analyse, difficulty)
            )
            if puzzle:
                return puzzle
        except Exception as e:
            logger.warning(f"Dynamic puzzle generation failed: {e}")
    valid = [p for p in STATIC_PUZZLES if p.get("difficulty") == difficulty]
    if not valid:
        valid = STATIC_PUZZLES or [{"id": "fallback", "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "best_move": "e2e4", "best_move_san": "e4", "evaluation": "+0.3", "theme": "center", "difficulty": difficulty, "pv_line": []}]
    puzzle = random.choice(valid)
    puzzle.setdefault("theme_label", THEME_LABELS.get(puzzle.get("theme", ""), "Tactics"))
    puzzle.setdefault("theme_description", THEME_DESCRIPTIONS.get(puzzle.get("theme", ""), ""))
    puzzle.setdefault("generated", False)
    return puzzle

class ChallengeValidateRequest(BaseModel):
    fen: str
    move: str
    difficulty: str
    attempts: int
    best_move_san: str = ""
    theme: str = ""

@app.post("/challenge/validate", response_model=ApiResponse)
async def validate_challenge(req: ChallengeValidateRequest):
    try:
        analysis = await ai_svc.analyze_move(
            fen_before=req.fen,
            move_uci=req.move,
            ply=1,
            depth=14,
            skill_level=20
        )
        user_eval = analysis.eval_after if analysis.eval_after is not None else 0.0
        best_eval = analysis.eval_before if analysis.eval_before is not None else 0.0
        delta = analysis.centipawn_loss / 100.0 if analysis.centipawn_loss is not None else 0.0
        thresholds = {"easy": 0.6, "medium": 0.35, "hard": 0.15}
        threshold = thresholds.get(req.difficulty, 0.35)
        is_exact = req.move[:4] == analysis.best_move_uci[:4]
        correct = delta <= threshold or is_exact
        if correct and req.attempts == 1:
            base_message = "Excellent! You found the key move."
        elif correct:
            base_message = f"Correct! You found it in {req.attempts} attempts."
        else:
            base_message = analysis.insight or "Not quite — try again."
        return ApiResponse.ok({
            "correct": correct,
            "best_move": analysis.best_move_uci,
            "best_move_san": analysis.best_move_san,
            "user_eval": user_eval,
            "best_eval": best_eval,
            "classification": analysis.classification,
            "message": base_message,
            "insight": analysis.insight,
            "line": analysis.pv_line or [],
            "attempts": req.attempts,
            "centipawn_loss": analysis.centipawn_loss,
        })
    except Exception as e:
        logger.error(f"Challenge validation error: {e}")
        return ApiResponse.fail(str(e))

class ChallengeHintRequest(BaseModel):
    puzzle_id: str
    current_level: int
    fen: str = ""
    theme: str = ""
    difficulty: str = "medium"
    best_move_san: str = ""

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

HINT_SYSTEM = """You are Kasparov giving a chess puzzle hint. Be concise — 1-2 sentences max.
Level 0: Vague directional hint (don't name the piece or square).
Level 1: Name the tactical theme (fork, pin, sacrifice, etc.).
Level 2: Identify the key piece or square involved.
Level 3: Describe the move almost completely without giving the full answer.
Never give the exact move. Be direct and instructive."""

async def _groq_hint(fen: str, theme: str, level: int, best_move_san: str, difficulty: str) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        fallback = [
            "Look carefully at all forcing moves.",
            f"The theme is: {theme or 'tactics'}.",
            "Focus on the most aggressive piece available.",
            f"The winning idea involves {best_move_san[:2] if best_move_san else 'a key square'}.",
        ]
        return fallback[min(level, len(fallback) - 1)]
    hint_prompt = f"""Chess puzzle hint request:
FEN: {fen}
Theme: {theme}
Difficulty: {difficulty}
Best move (DO NOT REVEAL): {best_move_san}
Hint level requested: {level} (0=vague, 3=near-complete)

Give hint level {level}. One or two sentences only."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                GROQ_API_URL,
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": HINT_SYSTEM},
                        {"role": "user", "content": hint_prompt},
                    ],
                    "max_tokens": 80,
                    "temperature": 0.5,
                },
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.warning(f"Groq hint failed: {e}")
        return "Look for the move that creates the most threats."

@app.post("/challenge/hint")
async def get_challenge_hint(req: ChallengeHintRequest):
    hint = await _groq_hint(
        fen=req.fen,
        theme=req.theme,
        level=min(req.current_level, 3),
        best_move_san=req.best_move_san,
        difficulty=req.difficulty,
    )
    return {"hint": hint}

class ChallengeExplainRequest(BaseModel):
    fen: str
    best_move_san: str
    theme: str
    pv_line: list[str] = []
    correct: bool
    centipawn_loss: int = 0
    difficulty: str = "medium"

EXPLAIN_SYSTEM = """You are Kasparov explaining a chess puzzle solution. Be concise and educational.
2-3 sentences maximum. Name the specific move. Explain WHY it works tactically/strategically.
If the player got it wrong, be encouraging but honest. Use precise chess language."""

@app.post("/challenge/explain")
async def explain_challenge(req: ChallengeExplainRequest):
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        if req.correct:
            return {"explanation": f"Well done! {req.best_move_san} exploits the {req.theme} theme perfectly."}
        return {"explanation": f"The key move was {req.best_move_san}, using the {req.theme} theme. Study the follow-up: {' '.join(req.pv_line[:3])}."}
    pv_str = " ".join(req.pv_line[:4]) if req.pv_line else "continuation unavailable"
    prompt = f"""Puzzle explanation:
Best move: {req.best_move_san}
Theme: {req.theme}
Follow-up line: {pv_str}
Player got it: {req.correct}
Centipawn loss if wrong: {req.centipawn_loss}

Explain the solution in 2-3 sentences. Why does {req.best_move_san} work? What does it threaten?"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                GROQ_API_URL,
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": EXPLAIN_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 120,
                    "temperature": 0.6,
                },
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
            data = resp.json()
            return {"explanation": data["choices"][0]["message"]["content"].strip()}
    except Exception as e:
        logger.warning(f"Groq explain failed: {e}")
        return {"explanation": f"The key move was {req.best_move_san}. {' → '.join(req.pv_line[:3]) if req.pv_line else ''}"}

import subprocess
@app.get("/debug-stockfish")
async def debug_stockfish():
    results = {}
    for path in ["/usr/bin/stockfish", "/usr/games/stockfish", "./stockfish_bin", "/opt/render/project/src/stockfish_bin"]:
        results[path] = os.path.isfile(path)
    try:
        r = subprocess.run(["which", "stockfish"], capture_output=True, text=True, timeout=5)
        results["which"] = r.stdout.strip()
    except Exception as e:
        results["which"] = str(e)
    try:
        r = subprocess.run(["find", "/opt/render", "-name", "stockfish*", "-type", "f"], capture_output=True, text=True, timeout=10)
        results["find_render"] = r.stdout.strip()
    except Exception as e:
        results["find_render"] = str(e)
    results["STOCKFISH_PATH_env"] = os.getenv("STOCKFISH_PATH", "not set")
    return results

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        loop="asyncio" if sys.platform == "win32" else "auto",
    )
    #debug
    import subprocess
@app.get("/debug-stockfish")
async def debug_stockfish():
    results = {}
    # Check common paths
    for path in ["/usr/bin/stockfish", "/usr/games/stockfish", "./stockfish_bin", "/opt/render/project/src/stockfish_bin"]:
        results[path] = os.path.isfile(path)
    # Try which command
    try:
        r = subprocess.run(["which", "stockfish"], capture_output=True, text=True, timeout=5)
        results["which"] = r.stdout.strip()
    except Exception as e:
        results["which"] = str(e)
    # Try find command
    try:
        r = subprocess.run(["find", "/opt/render", "-name", "stockfish*", "-type", "f"], capture_output=True, text=True, timeout=10)
        results["find_render"] = r.stdout.strip()
    except Exception as e:
        results["find_render"] = str(e)
    # Show current env var
    results["STOCKFISH_PATH_env"] = os.getenv("STOCKFISH_PATH", "not set")
    return results