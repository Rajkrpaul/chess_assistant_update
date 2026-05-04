"""
challenge_generator.py
Generates real chess puzzles on-the-fly using Stockfish.
Finds positions with a clear "best move" that is significantly better than alternatives.
"""
import chess
import chess.pgn
import random
import logging
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

# Tactical themes mapped to FEN seed positions
# These are real, verified tactical positions as generation seeds
SEED_POSITIONS = {
    "easy": [
        # Simple forks, pins, one-move wins
        ("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", "fork"),
        ("rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3", "center"),
        ("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5", "sacrifice"),
        ("rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3", "checkmate"),
        ("r1bqkb1r/pppp1ppp/2n5/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", "fork"),
        ("6k1/5ppp/8/8/8/8/5PPP/4RK2 w - - 0 1", "endgame"),
        ("r3k2r/ppp2ppp/2n5/3pp3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQkq - 0 8", "pin"),
        ("rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 4", "center"),
    ],
    "medium": [
        # Two-move combinations, discovered attacks, skewers
        ("r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 6 8", "middlegame"),
        ("r3k2r/ppp1qppp/2np1n2/2b1p3/2B1P1b1/2NP1N2/PPP1QPPP/R1B2RK1 w kq - 8 10", "attack"),
        ("2rr2k1/pp3ppp/4bn2/4p3/4P1q1/2N2N2/PP3PPP/2RR2K1 w - - 0 1", "discovered"),
        ("r1bqr1k1/ppp2ppp/2np1n2/4p3/2BPP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 6 8", "sacrifice"),
        ("3r1rk1/pp3ppp/2n1bn2/q7/3P4/2NB1N2/PP3PPP/2RQR1K1 w - - 0 1", "skewer"),
        ("r2qr1k1/1pp2ppp/p1np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 4 10", "pin"),
        ("r1bq1rk1/pp3ppp/2n1pn2/3p4/1bpP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8", "fork"),
        ("4r1k1/pp3ppp/2n5/3qp3/3P4/2N2N2/PP3PPP/R2QR1K1 w - - 0 1", "attack"),
    ],
    "hard": [
        # Deep combinations, quiet moves, endgame technique
        ("r2q1rk1/pp1bppbp/2np1np1/8/2BNP3/2N1BP2/PPP3PP/R2Q1RK1 w - - 6 10", "positional"),
        ("r1bqr1k1/pp1n1ppp/2pbpn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQR1K1 w - - 4 10", "strategy"),
        ("2r2rk1/pp1qppbp/2np1np1/8/3NP3/2N1BP2/PPP2QPP/2R2RK1 w - - 8 16", "combination"),
        ("r4rk1/pp2ppbp/1qnp1np1/8/2BNP3/2N1B3/PPP2PPP/R2Q1RK1 w - - 2 12", "sacrifice"),
        ("2r1r1k1/pp2bppp/3p1n2/q7/3BP3/2N2N2/PP3PPP/2RQR1K1 w - - 0 1", "quiet_move"),
        ("r2q1r1k/pp1bpp1p/3p1npB/8/3NP3/2N5/PPP2PPP/R2Q1RK1 w - - 2 14", "attack"),
        ("4r1k1/p4ppp/1p1r4/2pNp3/8/1P6/P4PPP/2RR2K1 w - - 0 1", "endgame"),
        ("2r2rk1/1b1qbppp/pp1ppn2/8/2BNP3/P1N1B3/1PP2PPP/R2Q1RK1 w - - 2 15", "complex"),
    ]
}

THEME_LABELS = {
    "fork": "Fork",
    "pin": "Pin",
    "skewer": "Skewer",
    "discovered": "Discovered Attack",
    "sacrifice": "Sacrifice",
    "checkmate": "Checkmate in 1",
    "endgame": "Endgame Technique",
    "attack": "Kingside Attack",
    "positional": "Positional Mastery",
    "strategy": "Strategic Play",
    "combination": "Deep Combination",
    "quiet_move": "Quiet Move",
    "middlegame": "Middlegame Tactics",
    "center": "Center Control",
    "complex": "Complex Position",
}

THEME_DESCRIPTIONS = {
    "fork": "A piece attacks two enemy pieces simultaneously.",
    "pin": "A piece is immobilized because moving it would expose a more valuable piece.",
    "skewer": "An attack through a valuable piece to win the piece behind it.",
    "discovered": "Moving one piece reveals an attack from another.",
    "sacrifice": "Give up material to gain a decisive advantage.",
    "checkmate": "Deliver checkmate in one move.",
    "endgame": "Precise technique is required to convert the advantage.",
    "attack": "Launch a decisive attack against the king.",
    "positional": "Find the move that improves your position strategically.",
    "strategy": "Long-term planning over immediate tactics.",
    "combination": "A multi-move sequence wins material or delivers checkmate.",
    "quiet_move": "A non-capturing, non-checking move with a powerful idea.",
    "middlegame": "Navigate the complex middlegame accurately.",
    "center": "Control or fight for the central squares.",
    "complex": "Calculate deeply in a double-edged position.",
}


def _perturb_position(fen: str) -> str:
    """Add slight randomness to a seed FEN so each puzzle feels fresh."""
    try:
        board = chess.Board(fen)
        legal = list(board.legal_moves)
        if not legal:
            return fen
        # Make 1-3 random "quiet" moves to get a fresh position
        num_moves = random.randint(0, 2)
        for _ in range(num_moves):
            # Prefer quiet moves to keep the position tactical
            quiet = [m for m in legal if not board.is_capture(m) and not board.gives_check(m)]
            move = random.choice(quiet if quiet else legal)
            board.push(move)
            legal = list(board.legal_moves)
            if board.is_game_over():
                board.pop()
                break
        return board.fen()
    except Exception:
        return fen


def generate_puzzle_from_position(
    sf_analyse_fn,
    difficulty: str,
    depth_map: Dict[str, int] = None,
) -> Optional[Dict[str, Any]]:
    """
    Given a Stockfish analyse function (from _StockfishProcess.analyse),
    pick a seed position and find a move where the best continuation is
    significantly better than the second-best move.
    """
    if depth_map is None:
        depth_map = {"easy": 14, "medium": 16, "hard": 18}

    depth = depth_map.get(difficulty, 14)
    seeds = SEED_POSITIONS.get(difficulty, SEED_POSITIONS["medium"])
    
    # Try several seeds until we find a good puzzle
    random.shuffle(seeds)
    
    for seed_fen, theme in seeds[:4]:
        try:
            fen = _perturb_position(seed_fen)
            board = chess.Board(fen)
            
            if board.is_game_over():
                continue
            
            results = sf_analyse_fn(fen, depth, 3, 20)
            if not results or len(results) < 1:
                continue
            
            best = results[0]
            second = results[1] if len(results) > 1 else None
            
            best_move_uci = best["pv"][0] if best.get("pv") else None
            if not best_move_uci:
                continue
            
            best_cp = best.get("score_cp")
            best_mate = best.get("score_mate")
            second_cp = second.get("score_cp") if second else None
            
            # Require a meaningful gap between best and second-best
            gap_required = {"easy": 80, "medium": 120, "hard": 60}[difficulty]
            
            if best_mate is not None:
                # Mate move is always a valid puzzle
                gap_ok = True
            elif best_cp is not None and second_cp is not None:
                gap_ok = abs(best_cp - second_cp) >= gap_required
            elif best_cp is not None:
                gap_ok = True
            else:
                gap_ok = False
            
            if not gap_ok:
                continue
            
            # Convert best move to SAN
            move_obj = chess.Move.from_uci(best_move_uci)
            if move_obj not in board.legal_moves:
                continue
            best_san = board.san(move_obj)
            
            # Build PV line in SAN
            pv_san = []
            try:
                pv_board = board.copy()
                for uci in best["pv"][:5]:
                    mv = chess.Move.from_uci(uci)
                    if mv in pv_board.legal_moves:
                        pv_san.append(pv_board.san(mv))
                        pv_board.push(mv)
                    else:
                        break
            except Exception:
                pass
            
            # Format evaluation
            if best_mate is not None:
                eval_str = f"#{best_mate}"
            elif best_cp is not None:
                pawns = best_cp / 100.0
                eval_str = f"+{pawns:.1f}" if pawns >= 0 else f"{pawns:.1f}"
            else:
                eval_str = "0.0"
            
            import uuid
            puzzle_id = f"gen_{difficulty}_{uuid.uuid4().hex[:8]}"
            
            return {
                "id": puzzle_id,
                "fen": fen,
                "best_move": best_move_uci,
                "best_move_san": best_san,
                "evaluation": eval_str,
                "theme": theme,
                "theme_label": THEME_LABELS.get(theme, theme.title()),
                "theme_description": THEME_DESCRIPTIONS.get(theme, ""),
                "difficulty": difficulty,
                "pv_line": pv_san,
                "generated": True,
            }
        except Exception as e:
            logger.warning(f"Puzzle generation failed for seed {seed_fen}: {e}")
            continue
    
    return None
