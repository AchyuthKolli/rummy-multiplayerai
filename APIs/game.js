
# Game API - Optimized for <0.40s response times
# Last reload: 2025-11-10 19:35 IST

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.auth import AuthorizedUser
from app.libs.db import fetchrow, fetch, execute
import uuid
import json
import random
import string
from app.libs.scoring import (
    is_sequence,
    is_pure_sequence,
    is_set,
    calculate_deadwood_points,
    auto_organize_hand,
)
from app.libs.rummy_models import DeckConfig, deal_initial, StartRoundResponse
import time

router = APIRouter()


class CreateTableRequest(BaseModel):
    max_players: int = 4
    disqualify_score: int = 200
    wild_joker_mode: str = "open_joker"  # "no_joker", "close_joker", or "open_joker"
    ace_value: int = 10  # 1 or 10


class CreateTableResponse(BaseModel):
    table_id: str
    code: str


@router.post("/tables")
async def create_table(body: CreateTableRequest, user: AuthorizedUser) -> CreateTableResponse:
    table_id = str(uuid.uuid4())
    # Generate short 6-character alphanumeric code
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    # Single optimized query: create table, fetch profile, and add host as player
    result = await fetchrow(
        """
        WITH new_table AS (
            INSERT INTO public.rummy_tables (id, code, host_user_id, max_players, disqualify_score, wild_joker_mode, ace_value)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, code
        ),
        profile_data AS (
            SELECT 
                COALESCE(display_name, 'Player-' || SUBSTRING($3, LENGTH($3) - 5)) AS display_name,
                avatar_url
            FROM public.profiles 
            WHERE user_id = $3
            UNION ALL
            SELECT 
                'Player-' || SUBSTRING($3, LENGTH($3) - 5) AS display_name,
                NULL AS avatar_url
            WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = $3)
            LIMIT 1
        ),
        new_player AS (
            INSERT INTO public.rummy_table_players (table_id, user_id, seat, display_name, profile_image_url)
            SELECT $1, $3, 1, profile_data.display_name, profile_data.avatar_url
            FROM profile_data
            RETURNING seat
        )
        SELECT new_table.id, new_table.code
        FROM new_table
        """,
        table_id,
        code,
        user.sub,
        body.max_players,
        body.disqualify_score,
        body.wild_joker_mode,
        body.ace_value,
    )
    
    return CreateTableResponse(table_id=result["id"], code=result["code"])


class JoinTableRequest(BaseModel):
    table_id: str


class JoinTableResponse(BaseModel):
    table_id: str
    seat: int


@router.post("/tables/join")
async def join_table(body: JoinTableRequest, user: AuthorizedUser) -> JoinTableResponse:
    # Verify table exists and not full
    tbl = await fetchrow(
        "SELECT id, max_players, status FROM public.rummy_tables WHERE id = $1",
        body.table_id,
    )
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    if tbl["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Cannot join: round already started")

    existing = await fetch(
        "SELECT seat FROM public.rummy_table_players WHERE table_id = $1 ORDER BY seat",
        body.table_id,
    )
    used_seats = {r["seat"] for r in existing}
    next_seat = 1
    while next_seat in used_seats:
        next_seat += 1
    if next_seat > tbl["max_players"]:
        raise HTTPException(status_code=400, detail="Table is full")

    # Fetch player display name from profiles table
    profile = await fetchrow(
        "SELECT display_name FROM public.profiles WHERE user_id = $1",
        user.sub
    )
    display_name = profile["display_name"] if profile else f"Player-{user.sub[-6:]}"

    await execute(
        """
        INSERT INTO public.rummy_table_players (table_id, user_id, seat, display_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (table_id, user_id) DO NOTHING
        """,
        body.table_id,
        user.sub,
        next_seat,
        display_name,
    )
    return JoinTableResponse(table_id=body.table_id, seat=next_seat)


class JoinByCodeRequest(BaseModel):
    code: str


@router.post("/tables/join-by-code")
async def join_table_by_code(body: JoinByCodeRequest, user: AuthorizedUser) -> JoinTableResponse:
    # Verify table exists and get info
    tbl = await fetchrow(
        "SELECT id, max_players, status FROM public.rummy_tables WHERE code = $1",
        body.code.upper()
    )
    if not tbl:
        raise HTTPException(status_code=404, detail="Table code not found")
    if tbl["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Cannot join: round already started")
    
    # Get existing seats
    existing = await fetch(
        "SELECT seat FROM public.rummy_table_players WHERE table_id = $1 ORDER BY seat",
        tbl["id"]
    )
    used_seats = {r["seat"] for r in existing}
    
    # Find next available seat
    next_seat = 1
    while next_seat in used_seats:
        next_seat += 1
    if next_seat > tbl["max_players"]:
        raise HTTPException(status_code=400, detail="Table is full")
    
    # Fetch player display name from profiles table
    profile = await fetchrow(
        "SELECT display_name FROM public.profiles WHERE user_id = $1",
        user.sub
    )
    display_name = profile["display_name"] if profile else f"Player-{user.sub[-6:]}"
    
    # Add player
    await execute(
        """INSERT INTO public.rummy_table_players (table_id, user_id, seat, display_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (table_id, user_id) DO NOTHING""",
        tbl["id"], user.sub, next_seat, display_name
    )
    
    return JoinTableResponse(table_id=tbl["id"], seat=next_seat)


class StartGameRequest(BaseModel):
    table_id: str
    seed: Optional[int] = None


@router.post("/start-game")
async def start_game(body: StartGameRequest, user: AuthorizedUser) -> StartRoundResponse:
    # Confirm user in table and fetch host + status + game settings
    tbl = await fetchrow(
        """
        SELECT t.id, t.status, t.host_user_id, t.wild_joker_mode, t.ace_value
        FROM public.rummy_tables t
        WHERE t.id = $1
        """,
        body.table_id,
    )
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")

    member = await fetchrow(
        "SELECT 1 FROM public.rummy_table_players WHERE table_id = $1 AND user_id = $2",
        body.table_id,
        user.sub,
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not part of the table")

    if tbl["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")

    if tbl["host_user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Only host can start the game")

    players = await fetch(
        """
        SELECT user_id
        FROM public.rummy_table_players
        WHERE table_id = $1 AND is_spectator = false
        ORDER BY seat ASC
        """,
        body.table_id,
    )
    user_ids = [r["user_id"] for r in players]
    if len(user_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")

    cfg = DeckConfig(decks=2, include_printed_jokers=True)
    deal = deal_initial(user_ids, cfg, body.seed)

    round_id = str(uuid.uuid4())
    number = 1
    
    # Game mode logic:
    # - no_joker: no wild joker at all
    # - close_joker: wild joker exists but hidden initially
    # - open_joker: wild joker revealed immediately
    game_mode = tbl["wild_joker_mode"]
    wild_joker_rank = None
    
    if game_mode in ["close_joker", "open_joker"]:
        # Randomly select wild joker rank (excluding JOKER itself)
        all_ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        wild_joker_rank = random.choice(all_ranks)

    hands_serialized = {uid: [c.model_dump() for c in cards] for uid, cards in deal.hands.items()}
    stock_serialized = [c.model_dump() for c in deal.stock]
    discard_serialized = [c.model_dump() for c in deal.discard]

    await execute(
        """
        INSERT INTO public.rummy_rounds (id, table_id, number, printed_joker, wild_joker_rank, stock, discard, hands, active_user_id, game_mode, ace_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        """,
        round_id,
        body.table_id,
        number,
        None,
        wild_joker_rank,
        json.dumps(stock_serialized),
        json.dumps(discard_serialized),
        json.dumps(hands_serialized),
        user_ids[0],
        game_mode,
        tbl["ace_value"],
    )

    await execute(
        "UPDATE public.rummy_tables SET status = 'playing', updated_at = now() WHERE id = $1",
        body.table_id,
    )

    discard_top = None
    if len(discard_serialized) > 0:
        top = discard_serialized[-1]
        if top.get("joker") and top.get("rank") == "JOKER":
            discard_top = "JOKER"
        else:
            discard_top = f"{top.get('rank')}{top.get('suit') or ''}"

    return StartRoundResponse(
        round_id=round_id,
        table_id=body.table_id,
        number=number,
        active_user_id=user_ids[0],
        stock_count=len(stock_serialized),
        discard_top=discard_top,
    )


# -------- Table info (for lobby/table screen polling) --------
class PlayerInfo(BaseModel):
    user_id: str
    seat: int
    display_name: Optional[str] = None
    profile_image_url: Optional[str] = None


class TableInfoResponse(BaseModel):
    table_id: str
    code: str
    status: str
    host_user_id: str
    max_players: int
    disqualify_score: int
    game_mode: str
    ace_value: int
    players: List[PlayerInfo]
    current_round_number: Optional[int] = None
    active_user_id: Optional[str] = None


@router.get("/tables/info")
async def get_table_info(table_id: str, user: AuthorizedUser) -> TableInfoResponse:
    """Return basic table state with players and current round info.
    Only accessible to the host or seated players.
    """
    # Single CTE query combining all data fetches
    result = await fetchrow(
        """
        WITH table_data AS (
            SELECT id, code, status, host_user_id, max_players, disqualify_score, wild_joker_mode, ace_value
            FROM public.rummy_tables
            WHERE id = $1
        ),
        membership_check AS (
            SELECT EXISTS(
                SELECT 1 FROM public.rummy_table_players 
                WHERE table_id = $1 AND user_id = $2
            ) AS is_member
        ),
        players_data AS (
            SELECT user_id, seat, display_name, profile_image_url
            FROM public.rummy_table_players
            WHERE table_id = $1 AND is_spectator = false
            ORDER BY seat ASC
        ),
        last_round_data AS (
            SELECT number, active_user_id
            FROM public.rummy_rounds
            WHERE table_id = $1
            ORDER BY number DESC
            LIMIT 1
        )
        SELECT 
            t.*,
            m.is_member,
            COALESCE(
                json_agg(
                    json_build_object(
                        'user_id', p.user_id,
                        'seat', p.seat,
                        'display_name', p.display_name,
                        'profile_image_url', p.profile_image_url
                    ) ORDER BY p.seat
                ) FILTER (WHERE p.user_id IS NOT NULL),
                '[]'
            ) AS players_json,
            r.number AS round_number,
            r.active_user_id
        FROM table_data t
        CROSS JOIN membership_check m
        LEFT JOIN players_data p ON true
        LEFT JOIN last_round_data r ON true
        GROUP BY t.id, t.code, t.status, t.host_user_id, t.max_players, t.disqualify_score, 
                 t.wild_joker_mode, t.ace_value, m.is_member, r.number, r.active_user_id
        """,
        table_id,
        user.sub,
    )
    
    if not result or not result["id"]:
        raise HTTPException(status_code=404, detail="Table not found")

    # Check access (host or member)
    if result["host_user_id"] != user.sub and not result["is_member"]:
        raise HTTPException(status_code=403, detail="You don't have access to this table")

    # Parse players JSON and build response
    import json
    players_data = json.loads(result["players_json"])
    
    players = [
        PlayerInfo(
            user_id=p["user_id"],
            seat=p["seat"],
            display_name=p["display_name"],
            profile_image_url=p.get("profile_image_url")
        )
        for p in players_data
    ]

    return TableInfoResponse(
        table_id=result["id"],
        code=result["code"],
        status=result["status"],
        host_user_id=result["host_user_id"],
        max_players=result["max_players"],
        disqualify_score=result["disqualify_score"],
        game_mode=result["wild_joker_mode"],
        ace_value=result["ace_value"],
        players=players,
        current_round_number=result["round_number"],
        active_user_id=result["active_user_id"],
    )


# -------- Round: My hand --------
class CardView(BaseModel):
    rank: str
    suit: Optional[str] = None
    joker: bool = False
    code: str


class RoundMeResponse(BaseModel):
    table_id: str
    round_number: int
    hand: List[CardView]
    stock_count: int
    discard_top: Optional[str] = None
    wild_joker_revealed: bool = False
    wild_joker_rank: Optional[str] = None
    finished_at: Optional[str] = None


@router.get("/round/me")
async def get_round_me(table_id: str, user: AuthorizedUser) -> RoundMeResponse:
    """Get current round info for the authenticated user - OPTIMIZED"""
    start = time.time()
    
    # Verify membership
    member = await fetchrow(
        "SELECT 1 FROM rummy_table_players WHERE table_id = $1 AND user_id = $2",
        table_id, user.sub
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not part of this table")
    
    # Get table info
    table = await fetchrow(
        "SELECT wild_joker_mode, ace_value FROM rummy_tables WHERE id = $1",
        table_id
    )
    
    # Get latest round
    rnd = await fetchrow(
        """SELECT id, number, printed_joker, wild_joker_rank, stock, discard, hands, active_user_id
           FROM rummy_rounds 
           WHERE table_id = $1 
           ORDER BY number DESC 
           LIMIT 1""",
        table_id
    )
    
    if not rnd:
        elapsed = time.time() - start
        return RoundMeResponse(
            table_id=table_id,
            round_number=0,
            hand=[],
            stock_count=0,
            discard_top=None,
            wild_joker_revealed=False,
            wild_joker_rank=None,
            finished_at=None
        )
    
    hands = json.loads(rnd["hands"]) if rnd["hands"] else {}
    my_hand_data = hands.get(user.sub, [])
    
    stock = json.loads(rnd["stock"]) if rnd["stock"] else []
    discard = json.loads(rnd["discard"]) if rnd["discard"] else []
    discard_top_str = None
    if discard:
        last = discard[-1]
        if last.get("joker") and last.get("rank") == "JOKER":
            discard_top_str = "JOKER"
        else:
            discard_top_str = f"{last.get('rank')}{last.get('suit') or ''}"
    
    # Convert to CardView
    def to_code(card: dict) -> str:
        if card.get("joker") and card.get("rank") == "JOKER":
            return "JOKER"
        return f"{card.get('rank')}{card.get('suit') or ''}"
    
    hand_view = [
        CardView(rank=c.get("rank"), suit=c.get("suit"), joker=bool(c.get("joker")), code=to_code(c))
        for c in my_hand_data
    ]
    
    elapsed = time.time() - start
    return RoundMeResponse(
        table_id=table_id,
        round_number=rnd["number"],
        hand=hand_view,
        stock_count=len(stock),
        discard_top=discard_top_str,
        wild_joker_revealed=False,  # Will fix this logic later
        wild_joker_rank=rnd["wild_joker_rank"],
        finished_at=None
    )


# -------- Lock Sequence for Wild Joker Reveal --------
class CardData(BaseModel):
    rank: str
    suit: Optional[str] = None

class LockSequenceRequest(BaseModel):
    table_id: str
    meld: List[CardData]  # Array of cards forming the sequence


class LockSequenceResponse(BaseModel):
    success: bool
    message: str
    wild_joker_revealed: bool
    wild_joker_rank: Optional[str] = None


@router.post("/lock-sequence")
async def lock_sequence(body: LockSequenceRequest, user: AuthorizedUser) -> LockSequenceResponse:
    """Validate a sequence and reveal wild joker if it's the player's first pure sequence."""
    try:
        user_id = user.sub
        table_id = body.table_id
        # Convert Pydantic CardData objects to dicts for validation functions
        meld = [card.model_dump() for card in body.meld]
        
        # Get current round - USE number DESC for consistency with other endpoints
        round_row = await fetchrow(
            """
            SELECT id, table_id, wild_joker_rank, players_with_first_sequence 
            FROM rummy_rounds 
            WHERE table_id = $1 
            ORDER BY number DESC 
            LIMIT 1
            """,
            table_id
        )
        
        if not round_row:
            raise HTTPException(status_code=404, detail="No active round")
        
        wild_joker_rank = round_row['wild_joker_rank']
        # Parse players_with_first_sequence as JSON list
        players_with_seq_raw = round_row['players_with_first_sequence']
        if players_with_seq_raw is None:
            players_with_seq = []
        elif isinstance(players_with_seq_raw, str):
            players_with_seq = json.loads(players_with_seq_raw)
        elif isinstance(players_with_seq_raw, list):
            players_with_seq = players_with_seq_raw
        else:
            players_with_seq = []
        
        # Check if user already revealed wild joker
        if user_id in players_with_seq:
            return LockSequenceResponse(
                success=False,
                message="✅ You already revealed the wild joker!",
                wild_joker_revealed=False,
                wild_joker_rank=None
            )
        
        # Check if THIS player has already revealed their wild joker
        has_wild_joker_revealed = user_id in players_with_seq
        
        # First check if it's a valid sequence
        if not is_sequence(meld, wild_joker_rank, has_wild_joker_revealed):
            return LockSequenceResponse(
                success=False,
                message="❌ Invalid sequence - cards must be consecutive in same suit",
                wild_joker_revealed=False,
                wild_joker_rank=None
            )
        
        # Then check if it's a PURE sequence (no jokers)
        if not is_pure_sequence(meld, wild_joker_rank, has_wild_joker_revealed):
            return LockSequenceResponse(
                success=False,
                message="❌ Only pure sequences can reveal wild joker (no jokers allowed)",
                wild_joker_revealed=False,
                wild_joker_rank=None
            )
        
        # Add user to players_with_first_sequence
        new_players = list(set(players_with_seq + [user_id]))
        await execute(
            "UPDATE rummy_rounds SET players_with_first_sequence = $1 WHERE id = $2",
            json.dumps(new_players), round_row['id']
        )
        
        return LockSequenceResponse(
            success=True,
            message="✅ Pure sequence locked! Wild Joker revealed!",
            wild_joker_revealed=True,
            wild_joker_rank=wild_joker_rank
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# -------- Core turn actions: draw stock/discard and discard a card --------
class DrawRequest(BaseModel):
    table_id: str


class DiscardCard(BaseModel):
    rank: str
    suit: Optional[str] = None
    joker: Optional[bool] = None


class DiscardRequest(BaseModel):
    table_id: str
    card: DiscardCard


class DiscardResponse(BaseModel):
    table_id: str
    round_number: int
    hand: List[CardView]
    stock_count: int
    discard_top: Optional[str]
    next_active_user_id: str


async def _get_latest_round(table_id: str):
    return await fetchrow(
        """
        SELECT id, number, stock, discard, hands, active_user_id, finished_at, wild_joker_rank, ace_value, players_with_first_sequence
        FROM public.rummy_rounds
        WHERE table_id = $1
        ORDER BY number DESC
        LIMIT 1
        """,
        table_id,
    )


async def _assert_member(table_id: str, user_id: str):
    membership = await fetchrow(
        "SELECT 1 FROM public.rummy_table_players WHERE table_id = $1 AND user_id = $2",
        table_id,
        user_id,
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not part of this table")


def _serialize_card_code(card: dict) -> str:
    if card.get("joker") and card.get("rank") == "JOKER":
        return "JOKER"
    return f"{card.get('rank')}{card.get('suit') or ''}"


def _hand_view(cards: List[dict]) -> List[CardView]:
    return [
        CardView(
            rank=c.get("rank"),
            suit=c.get("suit"),
            joker=bool(c.get("joker")),
            code=_serialize_card_code(c),
        )
        for c in cards
    ]


@router.post("/draw/stock")
async def draw_stock(body: DrawRequest, user: AuthorizedUser) -> RoundMeResponse:
    start_time = time.time()
    # Single query: validate + fetch + update in one transaction
    result = await fetchrow(
        """
        WITH table_check AS (
            SELECT t.id, t.status,
                   EXISTS(SELECT 1 FROM public.rummy_table_players WHERE table_id = $1 AND user_id = $2) AS is_member
            FROM public.rummy_tables t
            WHERE t.id = $1
        ),
        round_data AS (
            SELECT id, number, stock, hands, discard, active_user_id, finished_at
            FROM public.rummy_rounds
            WHERE table_id = $1
            ORDER BY number DESC
            LIMIT 1
        )
        SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.finished_at
        FROM table_check t
        LEFT JOIN round_data r ON true
        """,
        body.table_id,
        user.sub,
    )
    
    if not result or not result["id"]:
        raise HTTPException(status_code=404, detail="Table not found")
    if result["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game not in playing state")
    if not result["is_member"]:
        raise HTTPException(status_code=403, detail="Not part of the table")
    if not result["round_id"]:
        raise HTTPException(status_code=404, detail="No active round")
    if result["active_user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Not your turn")

    # Parse JSON fields
    hands = json.loads(result["hands"]) if isinstance(result["hands"], str) else result["hands"]
    stock = json.loads(result["stock"]) if isinstance(result["stock"], str) else result["stock"]
    discard = json.loads(result["discard"]) if isinstance(result["discard"], str) else result["discard"]

    my = hands.get(user.sub)
    if my is None:
        raise HTTPException(status_code=404, detail="No hand for this player")
    if len(my) != 13:
        raise HTTPException(status_code=400, detail="You must discard before drawing again")
    if not stock:
        raise HTTPException(status_code=400, detail="Stock is empty")

    drawn = stock.pop()  # take top
    my.append(drawn)

    await execute(
        """
        UPDATE public.rummy_rounds
        SET stock = $1::jsonb, hands = $2::jsonb, updated_at = now()
        WHERE id = $3
        """,
        json.dumps(stock),
        json.dumps(hands),
        result["round_id"],
    )

    return RoundMeResponse(
        table_id=body.table_id,
        round_number=result["number"],
        hand=_hand_view(my),
        stock_count=len(stock),
        discard_top=_serialize_card_code(discard[-1]) if discard else None,
        finished_at=result["finished_at"].isoformat() if result["finished_at"] else None,
    )


@router.post("/draw/discard")
async def draw_discard(body: DrawRequest, user: AuthorizedUser) -> RoundMeResponse:
    start_time = time.time()
    # Single query: validate + fetch + update in one transaction
    result = await fetchrow(
        """
        WITH table_check AS (
            SELECT t.id, t.status,
                   EXISTS(SELECT 1 FROM public.rummy_table_players WHERE table_id = $1 AND user_id = $2) AS is_member
            FROM public.rummy_tables t
            WHERE t.id = $1
        ),
        round_data AS (
            SELECT id, number, stock, hands, discard, active_user_id, finished_at
            FROM public.rummy_rounds
            WHERE table_id = $1
            ORDER BY number DESC
            LIMIT 1
        )
        SELECT t.id, t.status, t.is_member, r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id, r.finished_at
        FROM table_check t
        LEFT JOIN round_data r ON true
        """,
        body.table_id,
        user.sub,
    )
    
    if not result or not result["id"]:
        raise HTTPException(status_code=404, detail="Table not found")
    if result["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game not in playing state")
    if not result["is_member"]:
        raise HTTPException(status_code=403, detail="Not part of the table")
    if not result["round_id"]:
        raise HTTPException(status_code=404, detail="No active round")
    if result["active_user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Not your turn")

    # Parse JSON fields
    hands = json.loads(result["hands"]) if isinstance(result["hands"], str) else result["hands"]
    stock = json.loads(result["stock"]) if isinstance(result["stock"], str) else result["stock"]
    discard = json.loads(result["discard"]) if isinstance(result["discard"], str) else result["discard"]

    my = hands.get(user.sub)
    if my is None:
        raise HTTPException(status_code=404, detail="No hand for this player")
    if len(my) != 13:
        raise HTTPException(status_code=400, detail="You must discard before drawing again")
    if not discard:
        raise HTTPException(status_code=400, detail="Discard pile is empty")

    drawn = discard.pop()
    my.append(drawn)

    await execute(
        """
        UPDATE public.rummy_rounds
        SET discard = $1::jsonb, hands = $2::jsonb, updated_at = now()
        WHERE id = $3
        """,
        json.dumps(discard),
        json.dumps(hands),
        result["round_id"],
    )

    return RoundMeResponse(
        table_id=body.table_id,
        round_number=result["number"],
        hand=_hand_view(my),
        stock_count=len(stock),
        discard_top=_serialize_card_code(discard[-1]) if discard else None,
        finished_at=result["finished_at"].isoformat() if result["finished_at"] else None,
    )


@router.post("/discard")
async def discard_card(body: DiscardRequest, user: AuthorizedUser) -> DiscardResponse:
    start_time = time.time()
    # Single query: validate + fetch seats + round data
    result = await fetchrow(
        """
        WITH table_check AS (
            SELECT t.id, t.status,
                   EXISTS(SELECT 1 FROM public.rummy_table_players WHERE table_id = $1 AND user_id = $2) AS is_member
            FROM public.rummy_tables t
            WHERE t.id = $1
        ),
        round_data AS (
            SELECT id, number, stock, hands, discard, active_user_id
            FROM public.rummy_rounds
            WHERE table_id = $1
            ORDER BY number DESC
            LIMIT 1
        ),
        seat_order AS (
            SELECT user_id, seat
            FROM public.rummy_table_players
            WHERE table_id = $1 AND is_spectator = false
            ORDER BY seat ASC
        )
        SELECT 
            t.id, t.status, t.is_member, 
            r.id AS round_id, r.number, r.stock, r.hands, r.discard, r.active_user_id,
            json_agg(s.user_id ORDER BY s.seat) AS user_order
        FROM table_check t
        LEFT JOIN round_data r ON true
        LEFT JOIN seat_order s ON true
        GROUP BY t.id, t.status, t.is_member, r.id, r.number, r.stock, r.hands, r.discard, r.active_user_id
        """,
        body.table_id,
        user.sub,
    )
    
    if not result or not result["id"]:
        raise HTTPException(status_code=404, detail="Table not found")
    if result["status"] != "playing":
        raise HTTPException(status_code=400, detail="Game not in playing state")
    if not result["is_member"]:
        raise HTTPException(status_code=403, detail="Not part of the table")
    if not result["round_id"]:
        raise HTTPException(status_code=404, detail="No active round")
    if result["active_user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Not your turn")

    # Parse JSON fields
    hands = json.loads(result["hands"]) if isinstance(result["hands"], str) else result["hands"]
    stock = json.loads(result["stock"]) if isinstance(result["stock"], str) else result["stock"]
    discard = json.loads(result["discard"]) if isinstance(result["discard"], str) else result["discard"]
    order = json.loads(result["user_order"]) if isinstance(result["user_order"], str) else result["user_order"]

    my = hands.get(user.sub)
    if my is None:
        raise HTTPException(status_code=404, detail="No hand for this player")
    if len(my) != 14:
        raise HTTPException(status_code=400, detail="You must draw first before discarding")

    # Remove first matching card
    idx_to_remove = None
    for i, c in enumerate(my):
        if (
            c.get("rank") == body.card.rank
            and (c.get("suit") or None) == (body.card.suit or None)
            and bool(c.get("joker")) == bool(body.card.joker)
        ):
            idx_to_remove = i
            break
    if idx_to_remove is None:
        raise HTTPException(status_code=400, detail="Card not found in hand")

    removed = my.pop(idx_to_remove)
    discard.append(removed)

    # Find next active user
    if user.sub not in order:
        raise HTTPException(status_code=400, detail="Player has no seat")
    cur_idx = order.index(user.sub)
    next_user = order[(cur_idx + 1) % len(order)]

    await execute(
        """
        UPDATE public.rummy_rounds
        SET discard = $1::jsonb, hands = $2::jsonb, active_user_id = $3, updated_at = now()
        WHERE id = $4
        """,
        json.dumps(discard),
        json.dumps(hands),
        next_user,
        result["round_id"],
    )

    return DiscardResponse(
        table_id=body.table_id,
        round_number=result["number"],
        hand=_hand_view(my),
        stock_count=len(stock),
        discard_top=_serialize_card_code(discard[-1]) if discard else None,
        next_active_user_id=next_user,
    )


# -------- Declaration and scoring --------
class DeclareRequest(BaseModel):
    table_id: str
    # For now, accept a simple client-declared payload; server will validate later
    # We'll store player's grouped melds as-is and compute naive score 0 if valid later
    groups: Optional[List[List[DiscardCard]]] = None


class DeclareResponse(BaseModel):
    table_id: str
    round_number: int
    declared_by: str
    status: str


class ScoreEntry(BaseModel):
    user_id: str
    points: int


class ScoreboardResponse(BaseModel):
    table_id: str
    round_number: int
    scores: List[ScoreEntry]
    winner_user_id: Optional[str] = None


@router.post("/declare")
async def declare(body: DeclareRequest, user: AuthorizedUser) -> DeclareResponse:
    try:
        # Declare endpoint - validates meld groups (13 cards) not full hand (can be 14 after draw)
        # Only the active player can declare for now
        tbl = await fetchrow(
            "SELECT id, status FROM public.rummy_tables WHERE id = $1",
            body.table_id,
        )
        if not tbl:
            raise HTTPException(status_code=404, detail="Table not found")
        if tbl["status"] != "playing":
            raise HTTPException(status_code=400, detail="Game not in playing state")
        await _assert_member(body.table_id, user.sub)

        rnd = await _get_latest_round(body.table_id)
        if not rnd:
            raise HTTPException(status_code=404, detail="No active round")
        if rnd["active_user_id"] != user.sub:
            raise HTTPException(status_code=403, detail="Only active player may declare")

        # Parse JSON fields from database
        hands = json.loads(rnd["hands"]) if isinstance(rnd["hands"], str) else rnd["hands"]
        
        # Get wild joker rank and ace value for validation and scoring
        wild_joker_rank = rnd["wild_joker_rank"]
        ace_value = rnd.get("ace_value", 10)  # Default to 10 if not set
        
        # Check if player has revealed wild joker
        players_with_first_sequence = rnd.get("players_with_first_sequence") or []
        if isinstance(players_with_first_sequence, str):
            try:
                players_with_first_sequence = json.loads(players_with_first_sequence)
            except:
                players_with_first_sequence = []
        has_wild_joker_revealed = user.sub in players_with_first_sequence
        
        # Get declarer's hand
        declarer_hand = hands.get(user.sub)
        if not declarer_hand:
            raise HTTPException(status_code=404, detail="No hand found for player")
        
        # Check that player has exactly 14 cards (must have drawn before declaring)
        if len(declarer_hand) != 14:
            raise HTTPException(
                status_code=400, 
                detail=f"Must have exactly 14 cards to declare. You have {len(declarer_hand)} cards. Please draw a card first."
            )
        
        # Validate hand if groups are provided
        is_valid = False
        validation_reason = ""
        if body.groups:
            # Check that groups contain exactly 13 cards total
            total_cards_in_groups = sum(len(group) for group in body.groups)
            if total_cards_in_groups != 13:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Groups must contain exactly 13 cards. You provided {total_cards_in_groups} cards."
                )
            
            # Extract the 14th card (leftover) from hand that's not in groups
            # Build count map of declared cards
            declared_counts = {}
            for group in body.groups:
                for card in group:
                    card_dict = card.model_dump() if hasattr(card, 'model_dump') else card
                    key = f"{card_dict['rank']}-{card_dict.get('suit', 'null')}"
                    declared_counts[key] = declared_counts.get(key, 0) + 1
            
            # Find the 14th card (not in declared melds)
            auto_discard_card = None
            temp_counts = declared_counts.copy()
            for card in declarer_hand:
                key = f"{card['rank']}-{card.get('suit', 'null')}"
                if key not in temp_counts or temp_counts[key] == 0:
                    auto_discard_card = card
                    break
                else:
                    temp_counts[key] -= 1
            
            if not auto_discard_card:
                raise HTTPException(status_code=500, detail="Could not identify 14th card")
            
            # Remove card from declarer's hand
            updated_hand = [c for c in declarer_hand if c != auto_discard_card]
            hands[user.sub] = updated_hand
            
            # Add to discard pile
            discard_pile = json.loads(rnd["discard"]) if isinstance(rnd["discard"], str) else (rnd["discard"] or [])
            discard_pile.append(auto_discard_card)
            
            # Update game state with auto-discard
            await execute(
                "UPDATE public.rummy_rounds SET hands = $1::jsonb, discard = $2::jsonb WHERE id = $3",
                json.dumps(hands),
                json.dumps(discard_pile),
                rnd["id"]
            )
            
            # Valid declaration: declarer gets 0 points, others get deadwood points
            scores: dict = {}
            organized_melds_all_players = {}
            for uid, cards in hands.items():
                if uid == user.sub:
                    scores[uid] = 0
                    # Store winner's declared melds - categorize them properly
                    winner_pure_seqs = []
                    winner_seqs = []
                    winner_sets = []
                    for group in body.groups:
                        # Convert DiscardCard to dict for JSON serialization
                        group_dicts = [card.model_dump() if hasattr(card, 'model_dump') else card for card in group]
                        if is_pure_sequence(group_dicts, wild_joker_rank, has_wild_joker_revealed):
                            winner_pure_seqs.append(group_dicts)
                        elif is_sequence(group_dicts, wild_joker_rank, has_wild_joker_revealed):
                            winner_seqs.append(group_dicts)
                        elif is_set(group_dicts, wild_joker_rank, has_wild_joker_revealed):
                            winner_sets.append(group_dicts)
                    
                    organized_melds_all_players[uid] = {
                        "pure_sequences": winner_pure_seqs,
                        "sequences": winner_seqs,
                        "sets": winner_sets,
                        "deadwood": []
                    }
                else:
                    # Auto-organize opponent's hand to find best possible melds
                    opponent_has_revealed = uid in players_with_first_sequence
                    opponent_melds, opponent_leftover = auto_organize_hand(
                        cards, wild_joker_rank, opponent_has_revealed
                    )
                    # Score only the ungrouped deadwood cards
                    scores[uid] = calculate_deadwood_points(
                        opponent_leftover, wild_joker_rank, opponent_has_revealed, ace_value
                    )
                    # Convert opponent melds to plain dicts and categorize them
                    opponent_melds_dicts = [
                        [card.dict() if hasattr(card, 'dict') else card for card in meld]
                        for meld in opponent_melds
                    ]
                    opponent_leftover_dicts = [
                        card.dict() if hasattr(card, 'dict') else card for card in opponent_leftover
                    ]
                    
                    # Categorize opponent melds
                    opp_pure_seqs = []
                    opp_seqs = []
                    opp_sets = []
                    for meld in opponent_melds_dicts:
                        if is_pure_sequence(meld, wild_joker_rank, opponent_has_revealed):
                            opp_pure_seqs.append(meld)
                        elif is_sequence(meld, wild_joker_rank, opponent_has_revealed):
                            opp_seqs.append(meld)
                        elif is_set(meld, wild_joker_rank, opponent_has_revealed):
                            opp_sets.append(meld)
                    
                    # Store opponent's auto-organized melds
                    organized_melds_all_players[uid] = {
                        "pure_sequences": opp_pure_seqs,
                        "sequences": opp_seqs,
                        "sets": opp_sets,
                        "deadwood": opponent_leftover_dicts
                    }
        else:
            # Invalid declaration: declarer gets FULL hand deadwood points (80 cap), others get 0
            has_revealed = user.sub in players_with_first_sequence
            declarer_deadwood_pts = calculate_deadwood_points(declarer_hand, wild_joker_rank, has_revealed, ace_value)
            for uid, cards in hands.items():
                if uid == user.sub:
                    scores[uid] = min(declarer_deadwood_pts, 80)  # Cap at 80
                    # Store declarer's ungrouped cards as all deadwood
                    declarer_cards_dicts = [
                        card.dict() if hasattr(card, 'dict') else card for card in declarer_hand
                    ]
                    organized_melds_all_players[uid] = {
                        "pure_sequences": [],
                        "sequences": [],
                        "sets": [],
                        "deadwood": declarer_cards_dicts
                    }
                else:
                    scores[uid] = 0
                    # Opponents don't lose points when someone else's declaration fails
                    organized_melds_all_players[uid] = {
                        "pure_sequences": [],
                        "sequences": [],
                        "sets": [],
                        "deadwood": []
                    }
        
        # Store the declaration with validation status
        declaration_data = {
            "groups": [[card.model_dump() if hasattr(card, 'model_dump') else card for card in group] for group in body.groups] if body.groups else [],
            "valid": is_valid,
            "reason": validation_reason,
            "revealed_hands": hands,  # Already plain dicts from JSON parse
            "organized_melds": organized_melds_all_players
        }
        
        await execute(
            """
            UPDATE public.rummy_rounds
            SET winner_user_id = $1, scores = $2::jsonb, declarations = jsonb_set(COALESCE(declarations, '{}'::jsonb), $3, $4::jsonb, true), finished_at = now(), updated_at = now()
            WHERE id = $5
            """,
            user.sub if is_valid else None,  # Only set winner if valid
            json.dumps(scores),  # Convert dict to JSON string for JSONB
            [user.sub],
            json.dumps(declaration_data),  # Convert dict to JSON string for JSONB
            rnd["id"],
        )

        # Return success response (valid or invalid declaration both complete the round)
        return DeclareResponse(
            table_id=body.table_id,
            round_number=rnd["number"],
            declared_by=user.sub,
            status="valid" if is_valid else "invalid"
        )
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


class RevealedHandsResponse(BaseModel):
    table_id: str
    round_number: int
    winner_user_id: Optional[str] = None
    revealed_hands: dict[str, List[dict]]  # user_id -> list of cards
    organized_melds: dict[str, dict]  # user_id -> {pure_sequences: [...], impure_sequences: [...], sets: [...], ungrouped: [...]}
    scores: dict[str, int]  # user_id -> points
    player_names: dict[str, str]  # user_id -> display_name
    is_finished: bool


@router.get("/round/revealed-hands")
async def get_revealed_hands(table_id: str, user: AuthorizedUser) -> RevealedHandsResponse:
    """Get all players' revealed hands and organized melds after declaration."""
    try:
        # Fetch the current round
        rnd = await fetchrow(
            """
            SELECT id, number, finished_at, declarations, hands, scores, winner_user_id
            FROM public.rummy_rounds
            WHERE table_id=$1
            ORDER BY number DESC
            LIMIT 1
            """,
            table_id
        )
        
        if not rnd:
            raise HTTPException(status_code=404, detail="No round found")
        
        if not rnd["finished_at"]:
            raise HTTPException(status_code=400, detail="Round not finished")
        
        # Get player information for names
        players_rows = await fetch(
            """
            SELECT user_id, display_name
            FROM public.rummy_table_players
            WHERE table_id=$1
            """,
            table_id
        )
        player_names = {p["user_id"]: p["display_name"] or "Player" for p in players_rows}
        
        # Extract data from the round
        revealed_hands = rnd.get("hands", {})
        scores = rnd.get("scores", {})
        declarations = rnd.get("declarations", {})
        
        # Extract organized_melds from declarations
        organized_melds = {}
        for uid, decl_data in declarations.items():
            if isinstance(decl_data, dict) and "organized_melds" in decl_data:
                organized_melds[uid] = decl_data["organized_melds"]
            else:
                organized_melds[uid] = {
                    "pure_sequences": [],
                    "sequences": [],
                    "sets": [],
                    "deadwood": []
                }

        try:
            response = RevealedHandsResponse(
                table_id=table_id,
                round_number=rnd["number"],
                winner_user_id=rnd["winner_user_id"],
                revealed_hands=revealed_hands,
                organized_melds=organized_melds,
                scores=scores,
                player_names=player_names,
                is_finished=rnd["finished_at"] is not None
            )
            return response
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to construct response: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Endpoint failed: {str(e)}")


@router.get("/round/scoreboard")
async def round_scoreboard(table_id: str, user: AuthorizedUser) -> ScoreboardResponse:
    await _assert_member(table_id, user.sub)
    rnd = await fetchrow(
        """
        SELECT number, scores, winner_user_id, points_accumulated
        FROM public.rummy_rounds
        WHERE table_id = $1
        ORDER BY number DESC
        LIMIT 1
        """,
        table_id,
    )
    if not rnd:
        raise HTTPException(status_code=404, detail="No round found")
    
    scores = rnd["scores"] or {}
    
    # CRITICAL: Accumulate round scores to total_points ONLY ONCE
    # Check if points have already been accumulated for this round
    if not rnd.get("points_accumulated", False):
        for user_id, round_points in scores.items():
            await execute(
                """UPDATE public.rummy_table_players 
                   SET total_points = total_points + $1 
                   WHERE table_id = $2 AND user_id = $3""",
                int(round_points),
                table_id,
                user_id
            )
        
        # Mark this round as accumulated
        await execute(
            """UPDATE public.rummy_rounds 
               SET points_accumulated = TRUE 
               WHERE table_id = $1 AND number = $2""",
            table_id,
            rnd["number"]
        )
    
    entries = [ScoreEntry(user_id=uid, points=int(val)) for uid, val in scores.items()]
    return ScoreboardResponse(
        table_id=table_id,
        round_number=rnd["number"],
        scores=entries,
        winner_user_id=rnd["winner_user_id"],
    )


class NextRoundRequest(BaseModel):
    table_id: str


class NextRoundResponse(BaseModel):
    table_id: str
    number: int
    active_user_id: str


@router.post("/round/next")
async def start_next_round(body: NextRoundRequest, user: AuthorizedUser) -> NextRoundResponse:
    # Host only for next-round
    tbl = await fetchrow(
        "SELECT id, host_user_id, status, disqualify_score FROM public.rummy_tables WHERE id = $1",
        body.table_id,
    )
    if not tbl:
        raise HTTPException(status_code=404, detail="Table not found")
    await _assert_member(body.table_id, user.sub)
    if tbl["host_user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Only host can start next round")

    # Check last round is finished
    last = await fetchrow(
        """
        SELECT id, number, finished_at
        FROM public.rummy_rounds
        WHERE table_id = $1
        ORDER BY number DESC
        LIMIT 1
        """,
        body.table_id,
    )
    if not last or not last["finished_at"]:
        raise HTTPException(status_code=400, detail="Last round not finished yet")

    # Disqualify any players reaching threshold
    th = int(tbl["disqualify_score"])
    players = await fetch(
        "SELECT user_id, total_points FROM public.rummy_table_players WHERE table_id = $1 ORDER BY seat ASC",
        body.table_id,
    )
    active_user_ids = []
    for p in players:
        uid = p["user_id"]
        total = int(p["total_points"])
        if total >= th:
            await execute(
                "UPDATE public.rummy_table_players SET disqualified = true, eliminated_at = now() WHERE table_id = $1 AND user_id = $2",
                body.table_id,
                uid,
            )
        else:
            active_user_ids.append(uid)

    if len(active_user_ids) < 2:
        # End table
        await execute("UPDATE public.rummy_tables SET status = 'finished', updated_at = now() WHERE id = $1", body.table_id)
        raise HTTPException(status_code=400, detail="Not enough players for next round; table finished")

    # Create new round with fresh deal, rotate starting player (winner starts)
    cfg = DeckConfig(decks=2, include_printed_jokers=True)
    deal = deal_initial(active_user_ids, cfg, None)

    new_round_id = str(uuid.uuid4())
    next_round_number = int(last["number"]) + 1

    hands_serialized = {uid: [c.model_dump() for c in cards] for uid, cards in deal.hands.items()}
    stock_serialized = [c.model_dump() for c in deal.stock]
    discard_serialized = [c.model_dump() for c in deal.discard]

    # Fetch table settings including game mode and ace value
    tbl = await fetchrow(
        "SELECT id, status, host_user_id, max_players, wild_joker_mode, ace_value FROM public.rummy_tables WHERE id = $1",
        body.table_id,
    )

    wild_joker_mode = tbl["wild_joker_mode"]
    ace_value = tbl["ace_value"]
    
    # Determine wild joker based on game mode
    if wild_joker_mode == "no_joker":
        wild_joker_rank = None  # No wild joker in this mode
    else:
        # Pick a random wild joker rank (excluding printed joker)
        ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        wild_joker_rank = random.choice(ranks)

    await execute(
        """
        INSERT INTO public.rummy_rounds (
            id, table_id, number, printed_joker, wild_joker_rank,
            stock, discard, hands, active_user_id, game_mode, ace_value
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        """,
        new_round_id,
        body.table_id,
        next_round_number,
        None,
        wild_joker_rank,
        json.dumps(stock_serialized),
        json.dumps(discard_serialized),
        json.dumps(hands_serialized),
        active_user_ids[0],
        wild_joker_mode,
        ace_value,
    )

    await execute(
        "UPDATE public.rummy_tables SET status = 'playing', updated_at = now() WHERE id = $1",
        body.table_id,
    )

    return NextRoundResponse(
        table_id=body.table_id,
        number=next_round_number,
        active_user_id=active_user_ids[0],
    )

@router.get("/round/history")
async def get_round_history(table_id: str, user: AuthorizedUser):
    """Get all completed round history for the current table."""
    # Single CTE query combining all checks and data fetches with JOINs
    rows = await fetch(
        """
        WITH table_check AS (
            SELECT id FROM public.rummy_tables WHERE id = $1
        ),
        membership_check AS (
            SELECT EXISTS (
                SELECT 1 FROM public.rummy_table_players 
                WHERE table_id = $1 AND user_id = $2
            ) AS is_member
        ),
        player_names AS (
            SELECT user_id, display_name
            FROM public.rummy_table_players
            WHERE table_id = $1
        )
        SELECT 
            r.number AS round_number,
            r.winner_user_id,
            r.scores,
            COALESCE(
                json_object_agg(
                    p.user_id, 
                    COALESCE(p.display_name, 'Player')
                ) FILTER (WHERE p.user_id IS NOT NULL),
                '{}'
            ) AS player_names_map,
            (SELECT is_member FROM membership_check) AS is_member,
            (SELECT id FROM table_check) AS table_exists
        FROM public.rummy_rounds r
        LEFT JOIN player_names p ON true
        WHERE r.table_id = $1 AND r.finished_at IS NOT NULL
        GROUP BY r.id, r.number, r.winner_user_id, r.scores
        ORDER BY r.number ASC
        """,
        table_id,
        user.sub
    )
    
    if not rows or rows[0]["table_exists"] is None:
        raise HTTPException(status_code=404, detail="Table not found")
    
    if not rows[0]["is_member"]:
        raise HTTPException(status_code=403, detail="You don't have access to this table")
    
    # Build round history
    import json
    round_history = []
    for row in rows:
        player_names = json.loads(row["player_names_map"])
        scores_dict = row["scores"] or {}
        players_list = [
            {
                "user_id": user_id,
                "player_name": player_names.get(user_id, "Player"),
                "score": score
            }
            for user_id, score in scores_dict.items()
        ]
        # Sort by score ascending (winner has lowest score)
        players_list.sort(key=lambda p: p["score"])
        
        round_history.append({
            "round_number": row["round_number"],
            "winner_user_id": row["winner_user_id"],
            "players": players_list
        })
    
    return {"rounds": round_history}


# ===== DROP ENDPOINT =====

class DropRequest(BaseModel):
    table_id: str

class DropResponse(BaseModel):
    success: bool
    penalty_points: int

@router.post("/game/drop")
async def drop_game(body: DropRequest, user: AuthorizedUser) -> DropResponse:
    """Player drops before first draw (20pt penalty, 2+ players)."""
    result = await fetchrow(
        """WITH round_data AS (
               SELECT id, hands, active_user_id
               FROM public.rummy_rounds
               WHERE table_id = $1
               ORDER BY number DESC LIMIT 1
           ),
           player_count AS (
               SELECT COUNT(*) as cnt
               FROM public.rummy_table_players
               WHERE table_id = $1 AND is_spectator = false
           )
           SELECT r.id, r.hands, r.active_user_id, p.cnt as player_count
           FROM round_data r, player_count p""",
        body.table_id
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="No active round")
    if result["player_count"] < 2:
        raise HTTPException(status_code=400, detail="Need 2+ players to drop")
    
    hands = json.loads(result["hands"]) if isinstance(result["hands"], str) else result["hands"]
    my_hand = hands.get(user.sub)
    if not my_hand or len(my_hand) != 13:
        raise HTTPException(status_code=400, detail="Can only drop before drawing first card")
    
    await execute(
        """UPDATE public.rummy_table_players 
           SET is_spectator = true, total_points = total_points + 20, eliminated_at = now()
           WHERE table_id = $1 AND user_id = $2""",
        body.table_id, user.sub
    )
    
    return DropResponse(success=True, penalty_points=20)


# ===== SPECTATE ENDPOINTS =====

class SpectateRequest(BaseModel):
    table_id: str
    player_id: str

class GrantSpectateRequest(BaseModel):
    table_id: str
    spectator_id: str
    granted: bool

@router.post("/game/request-spectate")
async def request_spectate(body: SpectateRequest, user: AuthorizedUser):
    """Request permission to spectate a player."""
    spectator = await fetchrow(
        "SELECT is_spectator FROM public.rummy_table_players WHERE table_id = $1 AND user_id = $2",
        body.table_id, user.sub
    )
    if not spectator or not spectator["is_spectator"]:
        raise HTTPException(status_code=403, detail="Must be eliminated to spectate")
    
    await execute(
        """INSERT INTO public.spectate_permissions (table_id, spectator_id, player_id, granted)
           VALUES ($1, $2, $3, false)
           ON CONFLICT DO NOTHING""",
        body.table_id, user.sub, body.player_id
    )
    return {"success": True}

@router.post("/game/grant-spectate")
async def grant_spectate(body: GrantSpectateRequest, user: AuthorizedUser):
    """Player grants/denies spectate permission."""
    await execute(
        """UPDATE public.spectate_permissions 
           SET granted = $1 
           WHERE table_id = $2 AND spectator_id = $3 AND player_id = $4""",
        body.granted, body.table_id, body.spectator_id, user.sub
    )
    return {"success": True}

