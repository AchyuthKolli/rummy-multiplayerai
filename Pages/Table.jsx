


import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import apiclient from "../apiclient";
import type { GetTableInfoParams, TableInfoResponse, StartGameRequest, GetRoundMeParams, RoundMeResponse, DrawRequest, DiscardRequest, DiscardCard, DeclareRequest, ScoreboardResponse, RoundScoreboardParams, GetRevealedHandsParams, RevealedHandsResponse, LockSequenceRequest, GrantSpectateRequest } from "../apiclient/data-contracts";
import { Copy, Check, Crown, User2, Play, ArrowDown, Trash2, Trophy, X, ChevronDown, ChevronUp, LogOut, Mic, MicOff, UserX, Eye } from "lucide-react";
import { toast } from "sonner";
import { HandStrip } from "components/HandStrip";
import { useUser } from "@stackframe/react";
import { TableDiagram } from "components/TableDiagram";
import { GameRules } from 'components/GameRules';
import { CasinoTable3D } from 'components/CasinoTable3D';
import { PlayerProfile } from 'components/PlayerProfile';
import { PlayingCard } from "components/PlayingCard";
import { Button } from "@/components/ui/button";
import { ScoreboardModal } from "components/ScoreboardModal";
import { WildJokerRevealModal } from "components/WildJokerRevealModal";
import { PointsTable } from "components/PointsTable";
import { parseCardCode } from "utils/cardCodeUtils";
import ChatSidebar from "components/ChatSidebar";
import VoicePanel from 'components/VoicePanel';
import SpectateControls from 'components/SpectateControls';
import HistoryTable from 'components/HistoryTable';

// CardBack component with red checkered pattern
const CardBack = ({ className = "" }: { className?: string }) => (
  <div className={`relative bg-white rounded-lg border-2 border-gray-300 shadow-lg ${className}`}>
    <div className="absolute inset-0 rounded-lg overflow-hidden">
      <div
        className="w-full h-full"
        style={{
          background:
            "repeating-linear-gradient(45deg, #dc2626 0px, #dc2626 10px, white 10px, white 20px)",
        }}
      />
    </div>
  </div>
);

// Helper component for a 3-card meld slot box
interface MeldSlotBoxProps {
  title: string;
  slots: (RoundMeResponse["hand"][number] | null)[];
  setSlots: (slots: (RoundMeResponse["hand"][number] | null)[]) => void;
  myRound: RoundMeResponse | null;
  setMyRound: (round: RoundMeResponse) => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  tableId: string;
  onRefresh: () => void;
  hideLockButton?: boolean;
  gameMode?: string; // Add game mode prop
}

const MeldSlotBox = ({ title, slots, setSlots, myRound, setMyRound, isLocked = false, onToggleLock, tableId, onRefresh, hideLockButton, gameMode }: MeldSlotBoxProps) => {
  const [locking, setLocking] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealedRank, setRevealedRank] = useState<string | null>(null);
  
  const handleSlotDrop = (slotIndex: number, cardData: string) => {
    if (!myRound || isLocked) {
      if (isLocked) toast.error('Unlock meld first to modify');
      return;
    }
    
    const card = JSON.parse(cardData);
    
    // Check if slot is already occupied
    if (slots[slotIndex] !== null) {
      toast.error('Slot already occupied');
      return;
    }
    
    // Place card in slot
    const newSlots = [...slots];
    newSlots[slotIndex] = card;
    setSlots(newSlots);
    toast.success(`Card placed in ${title} slot ${slotIndex + 1}`);
  };
  
  const handleSlotClick = (slotIndex: number) => {
    if (!myRound || slots[slotIndex] === null || isLocked) {
      if (isLocked) toast.error('Unlock meld first to modify');
      return;
    }
    
    // Return card to hand
    const card = slots[slotIndex]!;
    const newSlots = [...slots];
    newSlots[slotIndex] = null;
    setSlots(newSlots);
    toast.success('Card returned to hand');
  };

  const handleLockSequence = async () => {
    console.log('🔒 Lock button clicked!');
    console.log('Slots:', slots);
    console.log('Table ID:', tableId);
    
    // Validate that all 3 slots are filled
    const cards = slots.filter(s => s !== null);
    console.log('Filled cards:', cards);
    
    if (cards.length !== 3) {
      console.log('❌ Not enough cards:', cards.length);
      toast.error('Fill all 3 slots to lock a sequence');
      return;
    }
    
    console.log('✅ Starting lock sequence API call...');
    setLocking(true);
    try {
      // Safely map cards with explicit null-checking
      const meldCards = cards.map(card => {
        if (!card) {
          throw new Error('Null card found in meld');
        }
        return {
          rank: card.rank,
          suit: card.suit || null
        };
      });
      
      const body: LockSequenceRequest = {
        table_id: tableId,
        meld: meldCards
      };
      console.log('Request body:', body);
      
      console.log('📡 Calling apiclient.lock_sequence...');
      const res = await apiclient.lock_sequence(body);
      console.log('✅ API response received:', res);
      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);
      
      const data = await res.json();
      console.log('📦 Response data:', data);

      if (data.success) {
        toast.success(data.message);
        if (onToggleLock) onToggleLock(); // Lock the meld in UI
        
        // Show flip animation popup if wild joker was just revealed
        if (data.wild_joker_revealed && data.wild_joker_rank) {
          setRevealedRank(data.wild_joker_rank);
          setShowRevealModal(true);
          setTimeout(() => fetchRoundMe(), 500); // Refresh to show revealed wild joker
        }
      } else {
        toast.error(data.message);
      }
    } catch (err: any) {
      console.log('❌ Lock sequence error:');
      console.log(err?.status, err?.statusText, '-', err?.error?.detail || 'An unexpected error occurred.');
      console.log('Error type:', typeof err);
      console.log('Error name:', err?.name);
      console.log('Error message:', err?.message);
      console.log('Error stack:', err?.stack);
      toast.error(err?.error?.detail || err?.message || 'Failed to lock sequence');
    } finally {
      setLocking(false);
      console.log('🏁 Lock sequence attempt completed');
    }
  };
  
  return (
    <>
      <div className={`border border-dashed rounded p-2 ${
        isLocked 
          ? 'border-amber-500/50 bg-amber-900/20' 
          : 'border-purple-500/30 bg-purple-900/10'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-purple-400">{title} (3 cards)</p>
          <div className="flex items-center gap-1">
            {/* Only show lock button if game mode uses wild jokers */}
            {!isLocked && gameMode !== 'no_joker' && (
              <button
                onClick={handleLockSequence}
                disabled={locking || slots.filter(s => s !== null).length !== 3}
                className="text-[10px] px-2 py-0.5 bg-green-700 text-green-100 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Lock this sequence to reveal wild joker"
              >
                {locking ? '...' : '🔒 Lock'}
              </button>
            )}
            {onToggleLock && (
              <button 
                onClick={onToggleLock}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isLocked 
                    ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                    : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                }`}
                title={isLocked ? 'Click to unlock' : 'Click to lock'}
              >
                {isLocked ? '🔒' : '🔓'}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {slots.map((card, i) => (
            <div
              key={i}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-purple-400'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-purple-400'); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-purple-400');
                const cardData = e.dataTransfer.getData('card');
                if (cardData) handleSlotDrop(i, cardData);
              }}
              onClick={() => handleSlotClick(i)}
              className="w-[60px] h-[84px] border-2 border-dashed border-muted-foreground/20 rounded bg-background/50 flex items-center justify-center cursor-pointer hover:border-purple-400/50 transition-all"
            >
              {card ? (
                <div className="scale-[0.6] origin-center">
                  <PlayingCard card={card} onClick={() => {}} />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Wild Joker Reveal Modal */}
      {revealedRank && (
        <WildJokerRevealModal
          isOpen={showRevealModal}
          onClose={() => setShowRevealModal(false)}
          wildJokerRank={revealedRank}
        />
      )}
    </>
  );
};

// Helper component for 4-card leftover slot box
interface LeftoverSlotBoxProps {
  slots: (RoundMeResponse["hand"][number] | null)[];
  setSlots: (slots: (RoundMeResponse["hand"][number] | null)[]) => void;
  myRound: RoundMeResponse | null;
  setMyRound: (round: RoundMeResponse) => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  tableId: string;
  onRefresh: () => void;
  gameMode?: string; // Add game mode prop
}

const LeftoverSlotBox = ({ slots, setSlots, myRound, setMyRound, isLocked = false, onToggleLock, tableId, onRefresh, gameMode }: LeftoverSlotBoxProps) => {
  const [locking, setLocking] = useState(false);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealedRank, setRevealedRank] = useState<string | null>(null);
  
  const handleSlotDrop = (slotIndex: number, cardData: string) => {
    if (!myRound || isLocked) return;
    
    const card = JSON.parse(cardData);
    
    // Check if slot is already occupied
    if (slots[slotIndex] !== null) {
      toast.error('Slot already occupied');
      return;
    }
    
    // Place card in slot
    const newSlots = [...slots];
    newSlots[slotIndex] = card;
    setSlots(newSlots);
    toast.success(`Card placed in leftover slot ${slotIndex + 1}`);
  };
  
  const handleSlotClick = (slotIndex: number) => {
    if (!myRound || slots[slotIndex] === null) return;
    
    // Return card to hand
    const card = slots[slotIndex]!;
    const newSlots = [...slots];
    newSlots[slotIndex] = null;
    setSlots(newSlots);
    toast.success('Card returned to hand');
  };

  const handleLockSequence = async () => {
    console.log('🔒 Lock button clicked (4-card)!');
    console.log('Slots:', slots);
    console.log('Table ID:', tableId);
    
    // Validate that all 4 slots are filled
    const cards = slots.filter(s => s !== null);
    console.log('Filled cards:', cards);
    
    if (cards.length !== 4) {
      console.log('❌ Not enough cards:', cards.length);
      toast.error('Fill all 4 slots to lock a sequence');
      return;
    }
    
    console.log('✅ Starting lock sequence API call (4-card)...');
    setLocking(true);
    try {
      // Safely map cards with explicit null-checking
      const meldCards = cards.map(card => {
        if (!card) {
          throw new Error('Null card found in meld');
        }
        return {
          rank: card.rank,
          suit: card.suit || null
        };
      });
      
      const body: LockSequenceRequest = {
        table_id: tableId,
        meld: meldCards
      };
      console.log('Request body:', body);
      
      console.log('📡 Calling apiclient.lock_sequence...');
      const res = await apiclient.lock_sequence(body);
      console.log('✅ API response received:', res);
      console.log('Response status:', res.status);
      console.log('Response ok:', res.ok);
      
      const data = await res.json();
      console.log('📦 Response data:', data);

      if (data.success) {
        toast.success(data.message);
        if (onToggleLock) onToggleLock(); // Lock the meld in UI
        
        // Show flip animation popup if wild joker was just revealed
        if (data.wild_joker_revealed && data.wild_joker_rank) {
          setRevealedRank(data.wild_joker_rank);
          setShowRevealModal(true);
        }
        
        onRefresh(); // Refresh to get updated wild joker status
      } else {
        toast.error(data.message);
      }
    } catch (err: any) {
      console.log('❌ Lock sequence error (4-card):');
      console.log(err?.status, err?.statusText, '-', err?.error?.detail || 'An unexpected error occurred.');
      console.log('Error type:', typeof err);
      console.log('Error name:', err?.name);
      console.log('Error message:', err?.message);
      console.log('Error stack:', err?.stack);
      console.log('Full error object:', err);
      toast.error(err?.error?.detail || err?.message || 'Failed to lock sequence');
    } finally {
      setLocking(false);
      console.log('🏁 Lock sequence attempt completed (4-card)');
    }
  };

  return (
    <>
      <div className={`border border-dashed rounded p-2 ${
        isLocked 
          ? 'border-amber-500/50 bg-amber-900/20' 
          : 'border-blue-500/30 bg-blue-900/10'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] text-blue-400">Leftover / 4-Card Seq</p>
          <div className="flex items-center gap-1">
            {/* Only show lock button if game mode uses wild jokers */}
            {!isLocked && gameMode !== 'no_joker' && (
              <button
                onClick={handleLockSequence}
                disabled={locking || slots.filter(s => s !== null).length !== 4}
                className="text-[10px] px-2 py-0.5 bg-green-700 text-green-100 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Lock this 4-card sequence to reveal wild joker"
              >
                {locking ? '...' : '🔒 Lock'}
              </button>
            )}
            {onToggleLock && (
              <button 
                onClick={onToggleLock}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  isLocked 
                    ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                    : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                }`}
                title={isLocked ? 'Click to unlock' : 'Click to lock'}
              >
                {isLocked ? '🔒' : '🔓'}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {slots.map((card, i) => (
            <div
              key={i}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-blue-400'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-blue-400'); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('ring-2', 'ring-blue-400');
                const cardData = e.dataTransfer.getData('card');
                if (cardData) handleSlotDrop(i, cardData);
              }}
              onClick={() => handleSlotClick(i)}
              className="w-[60px] h-[84px] border-2 border-dashed border-muted-foreground/20 rounded bg-background/50 flex items-center justify-center cursor-pointer hover:border-blue-400/50 transition-all"
            >
              {card ? (
                <div className="scale-[0.6] origin-center">
                  <PlayingCard card={card} onClick={() => {}} />
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Wild Joker Reveal Modal */}
      {revealedRank && (
        <WildJokerRevealModal
          isOpen={showRevealModal}
          onClose={() => setShowRevealModal(false)}
          wildJokerRank={revealedRank}
        />
      )}
    </>
  );
};

export default function Table() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const user = useUser();
  const tableId = sp.get("tableId");

  // State
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<TableInfoResponse | null>(null);
  const [myRound, setMyRound] = useState<RoundMeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [acting, setActing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scoreboard, setScoreboard] = useState<ScoreboardResponse | null>(null);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showWildJokerReveal, setShowWildJokerReveal] = useState(false);
  const [revealedWildJoker, setRevealedWildJoker] = useState<string | null>(null);
  const [roundHistory, setRoundHistory] = useState<any[]>([]);
  const [tableColor, setTableColor] = useState<'green' | 'red-brown'>('green');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [droppingGame, setDroppingGame] = useState(false);
  const [spectateRequested, setSpectateRequested] = useState(false);
  const [spectateRequests, setSpectateRequests] = useState<string[]>([]);
  const [showScoreboardModal, setShowScoreboardModal] = useState(false);
  const [showScoreboardPanel, setShowScoreboardPanel] = useState(false);
  const [revealedHands, setRevealedHands] = useState<any>(null);

  // DEBUG: Monitor tableId changes and URL
  useEffect(() => {
    console.log('🔍 Table Component - tableId from URL:', tableId);
    console.log('🔍 Full URL search params:', sp.toString());
    console.log('🔍 Current full URL:', window.location.href);
    if (!tableId) {
      console.error('❌ CRITICAL: tableId is missing from URL!');
      console.error('This could be caused by:');
      console.error('  1. Browser navigation/refresh losing URL params');
      console.error('  2. React Router navigation without tableId');
      console.error('  3. Component remounting unexpectedly');
    }
  }, [tableId, sp]);
  
  const [selectedCard, setSelectedCard] = useState<{ rank: string; suit: string | null; joker: boolean } | null>(null);
  const [lastDrawnCard, setLastDrawnCard] = useState<{ rank: string; suit: string | null } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pureSeq, setPureSeq] = useState<{ rank: string; suit: string | null; joker: boolean }[]>([]);
  const [meld1, setMeld1] = useState<(RoundMeResponse["hand"][number] | null)[]>([null, null, null]);
  const [meld2, setMeld2] = useState<(RoundMeResponse["hand"][number] | null)[]>([null, null, null]);
  const [meld3, setMeld3] = useState<(RoundMeResponse["hand"][number] | null)[]>([null, null, null]);
  const [leftover, setLeftover] = useState<(RoundMeResponse["hand"][number] | null)[]>([null, null, null, null]);
  const [prevRoundFinished, setPrevRoundFinished] = useState<string | null>(null);
  const [showPointsTable, setShowPointsTable] = useState(true);

  // Table Info box state
  const [tableInfoVisible, setTableInfoVisible] = useState(true);
  const [tableInfoMinimized, setTableInfoMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'spectate'>('info');
  console.log('🎨 Table.tsx render - current tableColor:', tableColor);

  // Meld lock state
  const [meldLocks, setMeldLocks] = useState<{
    meld1: boolean;
    meld2: boolean;
    meld3: boolean;
    leftover: boolean;
  }>({ meld1: false, meld2: false, meld3: false, leftover: false });

  // Load locked melds from localStorage on mount
  useEffect(() => {
    if (!tableId) return;
    const storageKey = `rummy_melds_${tableId}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const { meld1: m1, meld2: m2, meld3: m3, leftover: lo, locks } = JSON.parse(saved);
        if (locks.meld1) setMeld1(m1);
        if (locks.meld2) setMeld2(m2);
        if (locks.meld3) setMeld3(m3);
        if (locks.leftover) setLeftover(lo);
        setMeldLocks(locks);
      } catch (e) {
        console.error('Failed to load melds from localStorage:', e);
      }
    }
  }, [tableId]);

  // Save locked melds to localStorage whenever they change
  useEffect(() => {
    if (!tableId) return;
    const storageKey = `rummy_melds_${tableId}`;
    const data = {
      meld1,
      meld2,
      meld3,
      leftover,
      locks: meldLocks
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }, [tableId, meld1, meld2, meld3, leftover, meldLocks]);

  // Toggle lock for a specific meld
  const toggleMeldLock = (meldName: 'meld1' | 'meld2' | 'meld3' | 'leftover') => {
    setMeldLocks(prev => ({
      ...prev,
      [meldName]: !prev[meldName]
    }));
    toast.success(`${meldName} ${!meldLocks[meldName] ? 'locked' : 'unlocked'}`);
  };

  // Debug user object
  useEffect(() => {
    if (user) {
      console.log('User object:', { id: user.id, sub: user.id, displayName: user.displayName });
    }
  }, [user]);

  // Get cards that are placed in slots (not in hand anymore)
  const placedCards = useMemo(() => {
    const placed = [...meld1, ...meld2, ...meld3, ...leftover].filter(c => c !== null) as RoundMeResponse["hand"];
    return placed;
  }, [meld1, meld2, meld3, leftover]);

  // Filter hand to exclude placed cards - FIX for duplicate cards
  // Track which cards are used by counting occurrences
  const availableHand = useMemo(() => {
    if (!myRound) return [];
    
    // Count how many times each card (rank+suit combo) is placed in melds
    const placedCounts = new Map<string, number>();
    placedCards.forEach(card => {
      const key = `${card.rank}-${card.suit || 'null'}`;
      placedCounts.set(key, (placedCounts.get(key) || 0) + 1);
    });
    
    // Filter hand, keeping track of how many of each card we've already filtered
    const seenCounts = new Map<string, number>();
    return myRound.hand.filter(handCard => {
      const key = `${handCard.rank}-${handCard.suit || 'null'}`;
      const placedCount = placedCounts.get(key) || 0;
      const seenCount = seenCounts.get(key) || 0;
      
      if (seenCount < placedCount) {
        // This card should be filtered out (it's in a meld)
        seenCounts.set(key, seenCount + 1);
        return false;
      }
      return true;
    });
  }, [myRound, placedCards]);

  const refresh = async () => {
    if (!tableId) {
      console.error('❌ refresh() called without tableId');
      return;
    }
    try {
      const query: GetTableInfoParams = { table_id: tableId };
      const res = await apiclient.get_table_info(query);
      
      if (!res.ok) {
        console.error('❌ get_table_info failed with status:', res.status);
        // DO NOT navigate away - just log the error
        toast.error('Failed to refresh table info');
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      
      // Check if turn changed
      const turnChanged = info?.active_user_id !== data.active_user_id;
      console.log('🔄 Refresh:', { 
        prevActiveUser: info?.active_user_id, 
        newActiveUser: data.active_user_id, 
        turnChanged 
      });
      
      setInfo(data);
      // If playing, also fetch my hand
      if (data.status === "playing") {
        const r: GetRoundMeParams = { table_id: tableId };
        const rr = await apiclient.get_round_me(r);
        
        if (!rr.ok) {
          console.error('❌ get_round_me failed with status:', rr.status);
          toast.error('Failed to refresh hand');
          setLoading(false);
          return;
        }
        
        const roundData = await rr.json();
        setMyRound(roundData);
        
        // ALWAYS sync hasDrawn with actual hand length
        // 14 cards = player has drawn, 13 cards = player hasn't drawn yet
        const newHasDrawn = roundData.hand.length === 14;
        console.log('🔄 Syncing hasDrawn with hand length:', { 
          handLength: roundData.hand.length, 
          newHasDrawn,
          previousHasDrawn: hasDrawn
        });
        setHasDrawn(newHasDrawn);
      }
      
      // Clear loading state after successful fetch
      setLoading(false);
    } catch (e) {
      console.error("❌ Failed to refresh:", e);
      // DO NOT call navigate("/") here - this would cause auto-leave!
      toast.error('Connection error - retrying...');
      setLoading(false);
    }
  };

  const fetchRoundHistory = async () => {
    if (!info?.table_id) return;
    try {
      const response = await apiclient.get_round_history({ table_id: info.table_id });
      const data = await response.json();
      setRoundHistory(data.rounds || []);
    } catch (error) {
      console.error("Failed to fetch round history:", error);
    }
  };

  // Auto-refresh table info and round data every 15s instead of 5s
  useEffect(() => {
    if (!tableId) return;
    
    const interval = setInterval(() => {
      refresh();
    }, 15000); // Changed from 5000 to 15000
    
    return () => clearInterval(interval);
  }, [tableId]);

  // Initial load on mount
  useEffect(() => {
    if (!tableId) return;
    refresh();
  }, [tableId]);

  const canStart = useMemo(() => {
    if (!info || !user) return false;
    const seated = info.players.length;
    const isHost = user.id === info.host_user_id;
    return info.status === "waiting" && seated >= 2 && isHost;
  }, [info, user]);

  const isMyTurn = useMemo(() => {
    if (!user) return false;
    const userId = user.id;
    console.log('Turn check - active_user_id:', info?.active_user_id, 'user.id:', userId, 'match:', info?.active_user_id === userId);
    return info?.active_user_id === userId;
  }, [info, user]);

  // Reset hasDrawn when turn changes
  useEffect(() => {
    console.log('Turn state changed - isMyTurn:', isMyTurn, 'hasDrawn:', hasDrawn);
    if (!isMyTurn) {
      console.log('Not my turn - clearing all selection state');
      setHasDrawn(false);
      setSelectedCard(null);
      setLastDrawnCard(null);
    }
  }, [isMyTurn]);

  const onCopy = () => {
    if (!info?.code) return;
    navigator.clipboard.writeText(info.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onStart = async () => {
    if (!info || !tableId) return;
    console.log("Starting game for table:", tableId, "User:", user?.id, "Host:", info.host_user_id);
    setStarting(true);
    try {
      const body: StartGameRequest = { table_id: tableId };
      console.log("Calling start_game API with body:", body);
      const res = await apiclient.start_game(body);
      console.log("Start game response status:", res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Start game failed:", errorText);
        toast.error(`Failed to start game: ${errorText}`);
        return;
      }
      const data = await res.json();
      toast.success(`Round #${data.number} started`);
      await refresh();
    } catch (e: any) {
      console.error("Start game error:", e);
      toast.error(e?.message || "Failed to start game");
    } finally {
      setStarting(false);
    }
  };

  const onDrawStock = async () => {
    if (!tableId || !isMyTurn || hasDrawn) return;
    setActing(true);
    try {
      const body: DrawRequest = { table_id: tableId };
      const res = await apiclient.draw_stock(body);
      const data = await res.json();
      // Find the new card by comparing lengths
      const newCard = data.hand.find((card: any) => 
        !myRound?.hand.some(c => c.rank === card.rank && c.suit === card.suit)
      );
      if (newCard) {
        setLastDrawnCard({ rank: newCard.rank, suit: newCard.suit });
      }
      setMyRound(data);
      setHasDrawn(true);
      toast.success("Drew from stock");
    } catch (e: any) {
      toast.error("Failed to draw from stock");
    } finally {
      setActing(false);
    }
  };

  const onDrawDiscard = async () => {
    if (!tableId || !isMyTurn || hasDrawn) return;
    setActing(true);
    try {
      const body: DrawRequest = { table_id: tableId };
      const res = await apiclient.draw_discard(body);
      const data = await res.json();
      // The card being drawn is the CURRENT discard_top (before the draw)
      if (myRound?.discard_top) {
        // Parse the card code properly (e.g., "7S" -> rank="7", suit="S")
        const code = myRound.discard_top;
        let rank: string;
        let suit: string | null;
        
        if (code === 'JOKER') {
          rank = 'JOKER';
          suit = null;
        } else {
          // Last char is suit, rest is rank
          suit = code.slice(-1);
          rank = code.slice(0, -1);
        }
        
        setLastDrawnCard({ rank, suit });
      }
      setMyRound(data);
      setHasDrawn(true);
      toast.success("Drew from discard pile");
    } catch (e: any) {
      toast.error("Failed to draw from discard");
    } finally {
      setActing(false);
    }
  };

  const onDiscard = async () => {
    if (!tableId || !selectedCard || !hasDrawn) return;
    setActing(true);
    try {
      const body: DiscardRequest = { table_id: tableId, card: selectedCard };
      const res = await apiclient.discard_card(body);
      const data = await res.json();
      toast.success("Card discarded. Next player's turn.");
      setSelectedCard(null);
      setLastDrawnCard(null);
      setHasDrawn(false);
      await refresh();
    } catch (e: any) {
      toast.error("Failed to discard card");
    } finally {
      setActing(false);
    }
  };

  const fetchRevealedHands = async () => {
    console.log("📊 Fetching revealed hands...");
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const resp = await apiclient.get_revealed_hands({ table_id: tableId! });
        if (!resp.ok) {
          const errorText = await resp.text();
          console.error(`❌ API returned error (attempt ${attempt}/3):`, { status: resp.status, body: errorText });
          lastError = { status: resp.status, message: errorText };
          if (attempt < 3 && resp.status === 400) {
            console.log(`⏳ Waiting 500ms before retry ${attempt + 1}...`);
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          } else {
            break;
          }
        }
        const data = await resp.json();
        console.log("✅ Revealed hands fetched:", data);
        setRevealedHands(data);
        setShowScoreboardModal(true); // ← CHANGED: Set modal state to true
        setShowScoreboardPanel(true);
        return data;
      } catch (error: any) {
        console.error(`❌ Error fetching revealed hands (attempt ${attempt}/3):`, error);
        lastError = error;
        if (attempt < 3) {
          console.log(`⏳ Waiting 500ms before retry ${attempt + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          break;
        }
      }
    }
    const errorMsg = lastError?.message || lastError?.status || "Network error";
    toast.error(`Failed to load scoreboard: ${errorMsg}`);
    console.error("🚨 Final scoreboard error:", lastError);
    return null;
  };

  const onDeclare = async () => {
    console.log('🎯 Declare clicked');
    if (!meld1 || !meld2 || !meld3) {
      toast.error('Please create all 3 melds before declaring');
      return;
    }

    // Count cards in melds INCLUDING leftover as meld4
    const m1 = meld1?.length || 0;
    const m2 = meld2?.length || 0;
    const m3 = meld3?.length || 0;
    const m4 = leftover?.length || 0;
    const totalPlaced = m1 + m2 + m3 + m4;

    // Identify leftover cards (not in any meld OR leftover slot)
    const allMeldCards = [...(meld1 || []), ...(meld2 || []), ...(meld3 || []), ...(leftover || [])];
    const unplacedCards = myRound?.hand.filter(card => {
      const cardKey = `${card.rank}-${card.suit || 'null'}`;
      return !allMeldCards.some(m => `${m.rank}-${m.suit || 'null'}` === cardKey);
    }) || [];

    if (totalPlaced !== 13) {
      const unplacedCount = unplacedCards.length;
      const unplacedDisplay = unplacedCards
        .map(c => `${c.rank}${c.suit || ''}`)
        .join(', ');
      
      toast.error(
        `You must place all 13 cards in melds. Currently ${totalPlaced}/13 cards placed.\n\n` +
        `Unplaced ${unplacedCount} card${unplacedCount > 1 ? 's' : ''}: ${unplacedDisplay}\n\n` +
        `Place these in Meld 1, Meld 2, Meld 3, or Leftover slots.`,
        { duration: 6000 }
      );
      console.log(`❌ Not all 13 cards placed. Total: ${totalPlaced}`);
      return;
    }

    console.log('🎯 DECLARE BUTTON CLICKED!');
    console.log('tableId:', tableId);
    console.log('isMyTurn:', isMyTurn);
    console.log('hasDrawn:', hasDrawn);
    console.log('hand length:', myRound?.hand.length);
    
    if (!tableId) return;
    if (!isMyTurn) {
      toast.error("It's not your turn!");
      return;
    }
    
    // Check if player has drawn (must have 14 cards)
    const handLength = myRound?.hand.length || 0;
    if (handLength !== 14) {
      toast.error(
        `You must draw a card before declaring!\n` +
        `You have ${handLength} cards, but need 14 cards (13 to meld + 1 to discard).`,
        { duration: 5000 }
      );
      return;
    }
    
    // Collect meld groups (filter out null slots)
    const groups: RoundMeResponse["hand"][] = [];
    
    const meld1Cards = meld1?.filter(c => c !== null) as RoundMeResponse["hand"];
    if (meld1Cards.length > 0) groups.push(meld1Cards);
    
    const meld2Cards = meld2?.filter(c => c !== null) as RoundMeResponse["hand"];
    if (meld2Cards.length > 0) groups.push(meld2Cards);
    
    const meld3Cards = meld3?.filter(c => c !== null) as RoundMeResponse["hand"];
    if (meld3Cards.length > 0) groups.push(meld3Cards);

    const leftoverCards = leftover?.filter(c => c !== null) as RoundMeResponse["hand"];
    if (leftoverCards.length > 0) groups.push(leftoverCards);

    // Skip to API call - validation already done above
    console.log('✅ All checks passed, preparing API call...');
    setActing(true);
    try {
      // Transform CardView to DiscardCard (remove 'code' field)
      const discardGroups = groups.map(group => 
        group.map(card => ({
          rank: card.rank,
          suit: card.suit,
          joker: card.joker
        }))
      );
      
      const body: DeclareRequest = { table_id: tableId, groups: discardGroups };
      console.log('📤 Sending declare request:', JSON.stringify(body, null, 2));
      console.log('📡 About to call apiclient.declare()...');
      const res = await apiclient.declare(body);
      console.log('📨 Received response:', res);
      
      if (res.ok) {
        const data = await res.json();
        console.log("✅ DECLARE COMPLETED:", data);
        
        // Show appropriate message based on valid/invalid
        if (data.status === 'valid') {
          toast.success(`🏆 Valid declaration! You win round #${data.round_number} with 0 points!`);
        } else {
          toast.warning(`⚠️ Invalid declaration! You received 80 penalty points for round #${data.round_number}`);
        }
        
        console.log('🎯 Fetching revealed hands...');
        await fetchRevealedHands();
        console.log('✅ Revealed hands fetched');
        
        // Log state right after fetch
        console.log("🔍 POST-FETCH STATE CHECK:");
        console.log("  - showScoreboardModal:", showScoreboardModal);
        console.log("  - revealedHands:", revealedHands);
      } else {
        // Handle HTTP errors from backend
        let errorMessage = 'Failed to declare';
        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        }
        console.log('❌ Backend error:', errorMessage);
        toast.error(`❌ ${errorMessage}`, { duration: 5000 });
      }
    } catch (error: any) {
      // Network errors or other exceptions
      console.error('🚨 DECLARE EXCEPTION CAUGHT:');
      console.error('  Error object:', error);
      console.error('  Error type:', typeof error);
      console.error('  Error constructor:', error?.constructor?.name);
      console.error('  Error message:', error?.message);
      console.error('  Error stack:', error?.stack);
      console.error('  Error keys:', Object.keys(error || {}));
      console.error('  Full error JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      
      // Try to get more details about the request that failed
      if (error.response) {
        console.error('  Response status:', error.response.status);
        console.error('  Response data:', error.response.data);
      }
      if (error.request) {
        console.error('  Request:', error.request);
      }
      
      // Extract actual error message from Response object or other error types
      let errorMsg = 'Network error';
      
      // PRIORITY 1: Check if it's a Response object
      if (error instanceof Response) {
        try {
          const errorData = await error.json();
          errorMsg = errorData.detail || errorData.message || 'Failed to declare';
        } catch {
          try {
            const errorText = await error.text();
            errorMsg = errorText || 'Failed to declare';
          } catch {
            errorMsg = 'Failed to declare';
          }
        }
      }
      // PRIORITY 2: Check for error.message
      else if (error?.message) {
        errorMsg = error.message;
      }
      // PRIORITY 3: Check if it's a string
      else if (typeof error === 'string') {
        errorMsg = error;
      }
      // PRIORITY 4: Try toString (but avoid [object Object])
      else if (error?.toString && typeof error.toString === 'function') {
        const stringified = error.toString();
        if (stringified !== '[object Object]' && stringified !== '[object Response]') {
          errorMsg = stringified;
        }
      }
      
      toast.error(`❌ Failed to declare: ${errorMsg}`, { duration: 5000 });
    } finally {
      setActing(false);
    }
  };

  const onNextRound = async () => {
    if (!tableId || !info) return;
    setStarting(true);
    try {
      const body = { table_id: tableId };
      const res = await apiclient.start_next_round(body);
      const data = await res.json();
      toast.success(`Round #${data.number} started!`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to start next round");
    } finally {
      setStarting(false);
    }
  };

  // Drop game handler
  const onDropGame = async () => {
    if (!tableId || droppingGame) return;
    setDroppingGame(true);
    try {
      const body = { table_id: tableId };
      const res = await apiclient.drop_game(body);
      await res.json();
      toast.success("You have dropped from the game (20 point penalty)");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to drop game");
    } finally {
      setDroppingGame(false);
    }
  };

  // Spectate handlers
  const requestSpectate = async (playerId: string) => {
    if (!tableId || spectateRequested) return;
    setSpectateRequested(true);
    try {
      const body = { table_id: tableId, player_id: playerId };
      await apiclient.request_spectate(body);
      toast.success("Spectate request sent");
    } catch (e: any) {
      toast.error(e?.message || "Failed to request spectate");
    }
  };

  const grantSpectate = async (spectatorId: string) => {
    if (!tableId) return;
    try {
      const body: GrantSpectateRequest = { table_id: tableId, spectator_id: spectatorId, granted: true };
      await apiclient.grant_spectate(body);
      setSpectateRequests(prev => prev.filter(id => id !== spectatorId));
      toast.success("Spectate access granted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to grant spectate");
    }
  };

  // Voice control handlers
  const toggleVoiceMute = async () => {
    if (!tableId || !user) return;
    try {
      const body = { table_id: tableId, user_id: user.id, muted: !voiceMuted };
      await apiclient.mute_player(body);
      setVoiceMuted(!voiceMuted);
      toast.success(voiceMuted ? "Unmuted" : "Muted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to toggle mute");
    }
  };

  const onCardSelect = (card: RoundMeResponse["hand"][number], idx: number) => {
    if (!hasDrawn) return;
    setSelectedCard({ rank: card.rank, suit: card.suit || null, joker: card.joker || false });
  };

  const onReorderHand = (reorderedHand: RoundMeResponse["hand"]) => {
    if (myRound) {
      setMyRound({ ...myRound, hand: reorderedHand });
    }
  };

  const onSelectCard = (card: DiscardCard) => {
    if (!hasDrawn) return;
    setSelectedCard(card);
  };

  const onClearMelds = () => {
    setMeld1([null, null, null]);
    setMeld2([null, null, null]);
    setMeld3([null, null, null]);
    setLeftover([null, null, null, null]);
    toast.success('Melds cleared');
  };

  // Debug logging for button visibility
  useEffect(() => {
    console.log('🔍 Discard Button Visibility Check:', {
      isMyTurn,
      hasDrawn,
      selectedCard,
      handLength: myRound?.hand.length,
      showDiscardButton: isMyTurn && hasDrawn && selectedCard !== null,
      user_id: user?.id,
      active_user_id: info?.active_user_id
    });
  }, [isMyTurn, hasDrawn, selectedCard, myRound, user, info]);

  if (!tableId) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-foreground mb-4">Missing tableId.</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        {/* Collapsible Game Rules - positioned top right */}
        <GameRules defaultOpen={false} />
        
        {/* Remove the separate PointsTable component - it's now inside Table Info */}
        
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-foreground">Table</h2>
            <div className="flex items-center gap-2">
              {/* Voice Mute Toggle */}
              {info?.status === 'playing' && (
                <button
                  onClick={toggleVoiceMute}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium shadow-lg transition-colors ${
                    voiceMuted 
                      ? 'bg-red-700 hover:bg-red-600 text-white' 
                      : 'bg-green-700 hover:bg-green-600 text-white'
                  }`}
                  title={voiceMuted ? 'Unmute' : 'Mute'}
                >
                  {voiceMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
              
              {/* Drop Game Button (only before first draw) */}
              {info?.status === 'playing' && !hasDrawn && (
                <button
                  onClick={onDropGame}
                  disabled={droppingGame}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-lg font-medium shadow-lg transition-colors disabled:opacity-50"
                  title="Drop game (20pt penalty)"
                >
                  <UserX className="w-5 h-5" />
                  {droppingGame ? 'Dropping...' : 'Drop'}
                </button>
              )}
              
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium shadow-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Leave Table
              </button>
            </div>
          </div>

          {/* Responsive Layout: Single column on mobile, two columns on desktop */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr,300px]">
            {/* Main Game Area */}
            <div className="bg-card border border-border rounded-lg p-4 order-2 lg:order-1">
              {loading && <p className="text-muted-foreground">Loading…</p>}
              {!loading && info && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Room Code</p>
                      <p className="text-2xl font-bold tracking-wider text-green-400">{info.code}</p>
                    </div>
                    <button
                      onClick={onCopy}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-green-800 text-green-100 rounded-lg hover:bg-green-700"
                    >
                      {copied ? (<><Check className="w-4 h-4"/> Copied</>) : (<><Copy className="w-4 h-4"/> Copy</>)}
                    </button>
                  </div>

                  <div className="border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground mb-2">Players</p>
                    <div className="grid grid-cols-2 gap-3">
                      {info.players.map((p) => (
                        <div key={p.user_id} className={`flex items-center gap-2 bg-background px-2 py-1 rounded border border-border`}>
                          <div className="w-8 h-8 rounded-full bg-green-800/50 flex items-center justify-center">
                            <User2 className="w-4 h-4 text-green-200"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground text-sm truncate">Seat {p.seat}</p>
                            <p className="text-muted-foreground text-xs truncate">{p.display_name || p.user_id.slice(0,6)}</p>
                          </div>
                          {p.user_id === info.host_user_id && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded">
                              <Crown className="w-3 h-3"/> Host
                            </span>
                          )}
                          {info.status === "playing" && p.user_id === info.active_user_id && (
                            <span className="text-xs text-amber-400 font-medium">Active</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {info.current_round_number && myRound && (
                    <div className="border-t border-border pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Round #{info.current_round_number}</p>
                          {isMyTurn ? (
                            <p className="text-amber-400 font-medium text-sm">Your turn!</p>
                          ) : (
                            <p className="text-muted-foreground text-sm">Wait for your turn</p>
                          )}
                        </div>
                        <div className="flex gap-2 text-xs">
                          <div className="bg-background border border-border rounded px-2 py-1">
                            <span className="text-muted-foreground">Stock:</span> <span className="text-foreground font-medium">{myRound.stock_count}</span>
                          </div>
                          {myRound.discard_top && (
                            <div className="bg-background border border-border rounded px-2 py-1">
                              <span className="text-muted-foreground">Discard Top:</span> <span className="text-foreground font-medium">{myRound.discard_top}</span>
                            </div>
                          )}
                          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border border-purple-500/50 rounded px-2 py-1">
                            <span className="text-purple-200">Wild Joker:</span>{" "}
                            {myRound.wild_joker_revealed ? (
                              <span className="text-pink-300 font-bold">{myRound.wild_joker_rank}</span>
                            ) : (
                              <span className="text-purple-400 font-medium">???</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Table Color Picker */}
                      <div className="flex gap-2 items-center justify-end mb-2">
                        <span className="text-xs text-muted-foreground">Table Color:</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('🎨 GREEN button clicked!');
                            console.log('🎨 Before setState - tableColor:', tableColor);
                            setTableColor('green');
                            console.log('🎨 After setState - requested green');
                          }}
                          className={`pointer-events-auto w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer ${
                            tableColor === 'green' ? 'border-amber-400 scale-110 shadow-lg' : 'border-slate-600'
                          }`}
                          style={{ backgroundColor: '#15803d' }}
                          title="Green Felt"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('🎨 RED-BROWN button clicked!');
                            console.log('🎨 Before setState - tableColor:', tableColor);
                            setTableColor('red-brown');
                            console.log('🎨 After setState - requested red-brown');
                          }}
                          className={`pointer-events-auto w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer ${
                            tableColor === 'red-brown' ? 'border-amber-400 scale-110 shadow-lg' : 'border-slate-600'
                          }`}
                          style={{ backgroundColor: '#6b2f2f' }}
                          title="Red-Brown Felt"
                        />
                      </div>

                      {/* 3D Casino Table - Contains ONLY Stock, Discard, Wild Joker */}
                      <CasinoTable3D tableColor={tableColor} key={tableColor}>
                        {/* Player Positions Around Table - Only show if player exists */}
                        <div className="absolute inset-0 pointer-events-none">
                          {/* Top players (P2, P3, P4) */}
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-8">
                            {info?.players?.[1] && <PlayerProfile position="P2" name={info.players[1].display_name || 'Player 2'} profilePic={info.players[1].profile_image_url} isActive={info.players[1].user_id === info.active_user_id} />}
                            {info?.players?.[2] && <PlayerProfile position="P3" name={info.players[2].display_name || 'Player 3'} profilePic={info.players[2].profile_image_url} isActive={info.players[2].user_id === info.active_user_id} />}
                            {info?.players?.[3] && <PlayerProfile position="P4" name={info.players[3].display_name || 'Player 4'} profilePic={info.players[3].profile_image_url} isActive={info.players[3].user_id === info.active_user_id} />}
                          </div>
                          
                          {/* Left player (P1) */}
                          {info?.players?.[0] && (
                            <div className="absolute left-4 top-1/2 -translate-y-1/2">
                              <PlayerProfile position="P1" name={info.players[0].display_name || 'Player 1'} profilePic={info.players[0].profile_image_url} isActive={info.players[0].user_id === info.active_user_id} />
                            </div>
                          )}
                          
                          {/* Right player (P5) */}
                          {info?.players?.[4] && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              <PlayerProfile position="P5" name={info.players[4].display_name || 'Player 5'} profilePic={info.players[4].profile_image_url} isActive={info.players[4].user_id === info.active_user_id} />
                            </div>
                          )}
                          
                          {/* Bottom player (current user) */}
                          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                            <PlayerProfile position="You" name={user?.displayName || 'You'} profilePic={undefined} isActive={isMyTurn} isCurrentUser={true} />
                          </div>
                        </div>

                        {/* Cards ON the Table Surface - HORIZONTAL ROW */}
                        <div className="flex items-center justify-center h-full">
                          <div className="flex gap-12 items-center justify-center">
                            {/* Stock Pile - NOW CLICKABLE */}
                            <div className="flex flex-col items-center gap-2">
                              <button
                                type="button"
                                onClick={onDrawStock}
                                disabled={!isMyTurn || hasDrawn || acting}
                                className="relative w-[100px] h-[140px] transition-all duration-200 enabled:hover:scale-110 enabled:hover:-translate-y-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 drop-shadow-2xl enabled:cursor-pointer"
                                title={isMyTurn && !hasDrawn ? "Click to draw from stock" : ""}
                              >
                                {myRound.stock_count > 0 ? (
                                  <>
                                    <div className="absolute top-2 left-2 w-full h-full bg-red-800 border-2 border-red-900 rounded-lg shadow-lg transform rotate-3"></div>
                                    <div className="absolute top-1 left-1 w-full h-full bg-red-800 border-2 border-red-900 rounded-lg shadow-lg transform -rotate-2"></div>
                                    <div className="relative w-full h-full bg-red-800 border-2 border-red-900 rounded-lg shadow-2xl flex items-center justify-center">
                                      <span className="text-5xl">🃏</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-full h-full border-2 border-dashed border-green-600/40 rounded-lg flex items-center justify-center text-green-600/50 text-sm">
                                    Empty
                                  </div>
                                )}
                              </button>
                              <div className="flex flex-col items-center gap-1">
                                <p className="text-xs font-bold text-amber-400 tracking-wide">STOCK PILE</p>
                                {myRound.stock_count > 0 && (
                                  <div className="bg-black/90 text-amber-300 px-2 py-0.5 rounded-full text-xs font-bold border border-amber-500/50">
                                    {myRound.stock_count} cards
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Wild Joker Card - only show if game mode uses wild jokers */}
                            {info?.game_mode !== 'no_joker' && (
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-[100px] h-[140px]">
                                  {myRound.wild_joker_revealed && myRound.wild_joker_rank ? (
                                    <div className="w-full h-full bg-white border-4 border-yellow-500 rounded-xl shadow-2xl transform rotate-3">
                                      <span className="text-4xl font-bold text-yellow-600">{myRound.wild_joker_rank}</span>
                                      <span className="text-xs text-gray-600 mt-2 font-semibold">All {myRound.wild_joker_rank}s</span>
                                    </div>
                                  ) : (
                                    <div className="w-full h-full bg-red-800 border-2 border-red-900 rounded-xl shadow-2xl flex items-center justify-center">
                                      <span className="text-5xl">🃏</span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs font-bold text-amber-400 tracking-wide">
                                  {myRound.wild_joker_revealed ? (
                                    <span>WILD JOKER</span>
                                  ) : (
                                    <span>WILD JOKER</span>
                                  )}
                                </p>
                              </div>
                            )}

                            {/* Discard Pile */}
                            <div className="flex flex-col items-center gap-2">
                              <button
                                onClick={onDrawDiscard}
                                disabled={!isMyTurn || hasDrawn || acting || !myRound.discard_top}
                                className="relative w-[100px] h-[140px] transition-transform hover:scale-110 hover:-translate-y-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0"
                                title={isMyTurn && !hasDrawn && myRound.discard_top ? "Click to draw from discard" : myRound.discard_top ? "Not your turn" : "Discard pile empty"}
                              >
                                {myRound.discard_top ? (
                                  <>
                                    <div className="absolute top-0 left-0 w-full h-full bg-white rounded-xl border-2 border-gray-300 shadow-xl opacity-30 transform -translate-x-2 -translate-y-2" />
                                    <div className="absolute top-0 left-0 w-full h-full bg-white rounded-xl border-2 border-gray-300 shadow-xl opacity-50 transform -translate-x-1 -translate-y-1" />
                                    
                                    <div className="relative w-full h-full bg-white rounded-xl border-4 border-black shadow-2xl flex flex-col items-center justify-between p-2">
                                      {(() => {
                                        const card = parseCardCode(myRound.discard_top);
                                        if (card.joker) {
                                          return (
                                            <div className="flex-1 flex flex-col items-center justify-center">
                                              <span className="text-6xl drop-shadow-lg">🃏</span>
                                              <span className="text-xs text-gray-800 mt-1 drop-shadow">JOKER</span>
                                            </div>
                                          );
                                        }
                                        const isRed = card.suit === 'H' || card.suit === 'D';
                                        const suitSymbol = card.suit ? { H: '♥', D: '♦', S: '♠', C: '♣' }[card.suit] : '';
                                        return (
                                          <>
                                            <span className={`text-xl font-black drop-shadow ${isRed ? 'text-red-600' : 'text-black'}`}>
                                              {card.rank}{suitSymbol}
                                            </span>
                                            <span className={`text-6xl drop-shadow-lg ${isRed ? 'text-red-600' : 'text-black'}`}>
                                              {suitSymbol}
                                            </span>
                                            <span className={`text-3xl font-black drop-shadow ${isRed ? 'text-red-600' : 'text-black'}`}>
                                              {card.rank}
                                            </span>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </>
                                ) : (
                                  <div className="w-full h-full border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                                    Empty
                                  </div>
                                )}
                              </button>
                              <p className="text-xs font-bold text-amber-400 tracking-wide">DISCARD PILE</p>
                            </div>
                          </div>
                        </div>
                      </CasinoTable3D>

                      {/* Meld Grouping Zone - Outside the 3D table with clean design */}
                      <div className="bg-background/50 border border-dashed border-border rounded-lg p-4 mb-3 mt-6">
                        <p className="text-sm text-muted-foreground mb-2">
                          {hasDrawn ? "Organize your 13 cards into melds (drag cards to slots)" : "Organize melds (draw a card first)"}
                        </p>
                        
                        {/* Three 3-card meld boxes */}
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {/* Meld 1 - with lock button */}
                          <MeldSlotBox 
                            title="Meld 1" 
                            slots={meld1} 
                            setSlots={setMeld1}
                            myRound={myRound}
                            setMyRound={setMyRound}
                            isLocked={meldLocks.meld1}
                            onToggleLock={() => toggleMeldLock('meld1')}
                            tableId={tableId}
                            onRefresh={refresh}
                            gameMode={info?.game_mode}
                          />
                          {/* Meld 2 - no lock button */}
                          <MeldSlotBox 
                            title="Meld 2" 
                            slots={meld2} 
                            setSlots={setMeld2}
                            myRound={myRound}
                            setMyRound={setMyRound}
                            isLocked={meldLocks.meld2}
                            onToggleLock={() => toggleMeldLock('meld2')}
                            tableId={tableId}
                            onRefresh={refresh}
                            hideLockButton={true}
                            gameMode={info?.game_mode}
                          />
                          {/* Meld 3 - no lock button */}
                          <MeldSlotBox 
                            title="Meld 3" 
                            slots={meld3} 
                            setSlots={setMeld3}
                            myRound={myRound}
                            setMyRound={setMyRound}
                            isLocked={meldLocks.meld3}
                            onToggleLock={() => toggleMeldLock('meld3')}
                            tableId={tableId}
                            onRefresh={refresh}
                            hideLockButton={true}
                            gameMode={info?.game_mode}
                          />
                        </div>
                        
                        {/* Leftover cards */}
                        <LeftoverSlotBox 
                          slots={leftover} 
                          setSlots={setLeftover}
                          myRound={myRound}
                          setMyRound={setMyRound}
                          isLocked={meldLocks.leftover}
                          onToggleLock={() => toggleMeldLock('leftover')}
                          tableId={tableId}
                          onRefresh={refresh}
                          gameMode={info?.game_mode}
                        />
                        
                        {/* Clear melds button only */}
                        {hasDrawn && (
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={onClearMelds}
                              className="px-3 py-1.5 bg-red-700/70 text-red-100 rounded hover:bg-red-600 text-sm"
                            >
                              <Trash2 className="inline w-4 h-4 mr-1"/> Clear Melds
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Hand */}
                      <div className="bg-background border border-border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground mb-3">
                          Your Hand ({availableHand.length} cards)
                          {lastDrawnCard && <span className="ml-2 text-amber-400 text-xs">★ New card highlighted</span>}
                        </p>
                        <HandStrip
                          hand={availableHand}
                          onCardClick={hasDrawn ? onCardSelect : undefined}
                          selectedIndex={selectedCard ? availableHand.findIndex(
                            c => c.rank === selectedCard.rank && c.suit === selectedCard.suit
                          ) : undefined}
                          highlightIndex={lastDrawnCard ? availableHand.findIndex(
                            c => c.rank === lastDrawnCard.rank && c.suit === lastDrawnCard.suit
                          ) : undefined}
                          onReorder={onReorderHand}
                        />

                        {/* Discard Button - Only shown when card is selected */}
                        {isMyTurn && hasDrawn && selectedCard && (
                          <div className="bg-red-900/20 border-2 border-red-500/50 rounded-lg p-4 mt-4">
                            <p className="text-red-200 text-sm mb-2 text-center">
                              ✓ Card selected - Click to discard
                            </p>
                            <button
                              onClick={onDiscard}
                              disabled={acting}
                              className="w-full inline-flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              <Trash2 className="w-5 h-5" />
                              {acting ? "Discarding..." : `Discard ${selectedCard.rank}${selectedCard.suit || ''}`}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Declare & Discard Actions - When turn is active */}
                      {isMyTurn && hasDrawn && (
                        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 space-y-2">
                          <p className="text-blue-200 text-sm font-medium">Organize 13 cards into valid melds, then declare. The 14th card will be auto-discarded.</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                console.log('🔴 DECLARE BUTTON CLICKED!');
                                console.log('🔴 Button state:', { isMyTurn, hasDrawn, acting, tableId });
                                console.log('🔴 Melds:', { meld1: meld1?.length, meld2: meld2?.length, meld3: meld3?.length, leftover: leftover?.length });
                                onDeclare();
                              }}
                              disabled={acting}
                              className="inline-flex items-center gap-2 px-4 py-3 bg-purple-700 text-purple-100 rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                            >
                              <Trophy className="w-5 h-5" />
                              {acting ? "Declaring..." : "Declare & Win"}
                            </button>
                            {selectedCard && (
                              <button
                                onClick={onDiscard}
                                disabled={acting}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-red-700 text-red-100 rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                              >
                                Discard Selected
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scoreboard Display */}
                  {scoreboard && info?.status === "finished" && (
                    <div className="border-t border-border pt-4 space-y-4">
                      <div className="bg-gradient-to-br from-amber-900/20 to-yellow-900/20 border border-amber-500/30 rounded-lg p-6">
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <Trophy className="w-8 h-8 text-amber-400" />
                          <h3 className="text-2xl font-bold text-amber-400">Round #{scoreboard.round_number} Complete!</h3>
                        </div>
                        
                        {scoreboard.winner_user_id && (
                          <div className="text-center mb-4">
                            <p className="text-lg text-green-300">
                              🎉 Winner: {info.players.find(p => p.user_id === scoreboard.winner_user_id)?.display_name || "Unknown"}
                            </p>
                          </div>
                        )}

                        <div className="bg-background/50 rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-muted/50 border-b border-border">
                                <th className="text-left px-4 py-2 text-sm font-medium text-foreground">Player</th>
                                <th className="text-right px-4 py-2 text-sm font-medium text-foreground">Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scoreboard.scores
                                .sort((a, b) => a.points - b.points)
                                .map((score, idx) => {
                                  const player = info.players.find(p => p.user_id === score.user_id);
                                  const isWinner = score.user_id === scoreboard.winner_user_id;
                                  return (
                                    <tr key={score.user_id} className={`border-b border-border/50 ${
                                      isWinner ? 'bg-green-900/20' : ''
                                    }`}>
                                      <td className="px-4 py-3 text-sm">
                                        <div className="flex items-center gap-2">
                                          {isWinner && <Trophy className="w-4 h-4 text-amber-400" />}
                                          <span className={isWinner ? 'text-green-300 font-medium' : 'text-foreground'}>
                                            {player?.display_name || score.user_id.slice(0, 6)}
                                          </span>
                                        </div>
                                      </td>
                                      <td className={`px-4 py-3 text-right text-sm ${
                                        isWinner ? 'text-green-400 font-bold' : 'text-foreground'
                                      }`}>
                                        {score.points}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Next Round Button */}
                      {user && info.host_user_id === user.id && (
                        <div className="text-center">
                          <button
                            onClick={onNextRound}
                            disabled={acting}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-green-700 text-green-100 rounded-lg hover:bg-green-600 font-medium"
                          >
                            <Play className="w-5 h-5" />
                            {acting ? "Starting..." : "Start Next Round"}
                          </button>
                        </div>
                      )}
                      {user && info.host_user_id !== user.id && (
                        <p className="text-center text-sm text-muted-foreground">Waiting for host to start next round...</p>
                      )}
                    </div>
                  )}

                  {/* Show Next Round button if user is host and round is complete */}
                  {info?.status === 'round_complete' && info?.host_id === user?.id && (
                    <div className="flex justify-center mt-8">
                      <Button
                        onClick={onNextRound}
                        disabled={acting}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-4 text-lg font-bold"
                      >
                        {acting ? 'Starting...' : '▶ Start Next Round'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar - Table Info with Round History */}
            {tableInfoVisible && (
              <div className={`bg-card border border-border rounded-lg shadow-lg ${
                tableInfoMinimized ? 'w-auto' : 'order-1 lg:order-2'
              }`}>
                {/* Header with Minimize/Close */}
                <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border rounded-t-lg">
                  <h3 className="text-sm font-semibold text-foreground">
                    {tableInfoMinimized ? 'Table' : 'Table Info'}
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setTableInfoMinimized(!tableInfoMinimized)}
                      className="p-1 hover:bg-muted rounded"
                      title={tableInfoMinimized ? 'Expand' : 'Minimize'}
                    >
                      {tableInfoMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setTableInfoVisible(false)}
                      className="p-1 hover:bg-muted rounded"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content - only show when not minimized */}
                {!tableInfoMinimized && (
                  <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                    {loading && <p className="text-muted-foreground">Loading…</p>}
                    {!loading && info && (
                      <>
                        {/* Room Code */}
                        <div>
                          <p className="text-sm text-muted-foreground">Room Code</p>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="text-lg font-mono text-foreground bg-background px-3 py-1 rounded border border-border">
                              {info.code}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(info.code);
                                toast.success("Code copied!");
                              }}
                              className="p-1.5 hover:bg-muted rounded"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Players */}
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Players ({info.players.length})</p>
                          <div className="space-y-1.5">
                            {info.players.map((p) => (
                              <div
                                key={p.user_id}
                                className="flex items-center gap-2 text-sm bg-background px-2 py-1 rounded border border-border"
                              >
                                <div className="w-8 h-8 rounded-full bg-green-800/50 flex items-center justify-center">
                                  <User2 className="w-4 h-4 text-green-200"/>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground text-sm truncate">Seat {p.seat}</p>
                                  <p className="text-muted-foreground text-xs truncate">{p.display_name || p.user_id.slice(0,6)}</p>
                                </div>
                                {p.user_id === info.host_user_id && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded">
                                    <Crown className="w-3 h-3"/> Host
                                  </span>
                                )}
                                {info.status === "playing" && p.user_id === info.active_user_id && (
                                  <span className="text-xs text-amber-400 font-medium">Active</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Status */}
                        <div className="border-t border-border pt-3">
                          <p className="text-sm text-muted-foreground">Status: <span className="text-foreground font-medium">{info?.status ?? "-"}</span></p>
                          {user && info.host_user_id === user.id && (
                            <button
                              onClick={onStart}
                              disabled={!canStart || starting}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 mt-2"
                            >
                              <Play className="w-5 h-5" />
                              {starting ? "Starting…" : "Start Game"}
                            </button>
                          )}
                          {info && info.status === "waiting" && user && user.id !== info.host_user_id && (
                            <p className="text-sm text-muted-foreground text-center py-2">Waiting for host to start...</p>
                          )}
                        </div>

                        {/* Round History & Points Table */}
                        {roundHistory.length > 0 && (
                          <div className="border-t border-border pt-3">
                            <h4 className="text-sm font-semibold text-foreground mb-2">Round History</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border">
                                    <th className="text-left py-2 px-2 font-semibold text-foreground">Player</th>
                                    {roundHistory.map((round, idx) => (
                                      <th key={idx} className="text-center py-2 px-1 font-semibold text-foreground">
                                        R{round.round_number}
                                      </th>
                                    ))}
                                    <th className="text-right py-2 px-2 font-semibold text-yellow-600 dark:text-yellow-500">
                                      Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {info.players.map((player) => {
                                    let runningTotal = 0;
                                    return (
                                      <tr key={player.user_id} className="border-b border-border/50">
                                        <td className="py-2 px-2 text-foreground">
                                          <div className="flex items-center gap-1">
                                            {player.display_name || 'Player'}
                                          </div>
                                        </td>
                                        {roundHistory.map((round, idx) => {
                                          const isWinner = round.winner_user_id === player.user_id;
                                          const roundScore = round.scores[player.user_id] || 0;
                                          runningTotal += roundScore;
                                          return (
                                            <td key={idx} className="text-center py-2 px-1">
                                              <div className="flex flex-col items-center">
                                                <span className={isWinner ? 'text-green-600 dark:text-green-500 font-semibold' : 'text-muted-foreground'}>
                                                  {roundScore}
                                                </span>
                                                {isWinner && <Trophy className="w-3 h-3 text-yellow-500" />}
                                              </div>
                                            </td>
                                          );
                                        })}
                                        <td className="text-right py-2 px-2 font-bold text-yellow-600 dark:text-yellow-500">
                                          {runningTotal}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Show Table Info button when closed */}
            {!tableInfoVisible && (
              <button
                onClick={() => setTableInfoVisible(true)}
                className="fixed top-20 right-4 z-20 bg-card border border-border rounded-lg shadow-lg px-4 py-2 hover:bg-accent/50 transition-colors"
              >
                Show Table Info
              </button>
            )}

            {/* Spectate Requests Panel (Host Only) */}
            {info?.host_user_id === user?.id && spectateRequests.length > 0 && (
              <div className="absolute top-20 right-4 z-50 bg-slate-800 border border-slate-600 rounded-lg p-4 max-w-xs">
                <h3 className="text-sm font-bold text-amber-400 mb-2">Spectate Requests</h3>
                <div className="space-y-2">
                  {spectateRequests.map(userId => (
                    <div key={userId} className="flex items-center justify-between gap-2 bg-slate-900 p-2 rounded">
                      <span className="text-xs text-slate-300 truncate">{userId.slice(0, 8)}...</span>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => grantSpectate(userId)}
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                        >
                          Allow
                        </Button>
                        <Button
                          onClick={() => setSpectateRequests(prev => prev.filter(id => id !== userId))}
                          variant="destructive"
                          size="sm"
                          className="h-6 px-2 text-xs"
                        >
                          Deny
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Scoreboard Modal */}
          <ScoreboardModal
            isOpen={showScoreboardModal && !!revealedHands}
            onClose={() => setShowScoreboardModal(false)}
            data={revealedHands}
            players={info?.players || []}
            currentUserId={user?.id || ''}
            tableId={tableId || ''}
            hostUserId={info?.host_user_id || ''}
            onNextRound={() => {
              setShowScoreboardModal(false);
              onNextRound();
            }}
          />

          {/* Side Panel for Scoreboard - Legacy */}
          {showScoreboardPanel && revealedHands && (
            <div className="fixed right-0 top-0 h-full w-96 bg-gray-900/95 border-l-2 border-yellow-500 shadow-2xl z-50 overflow-y-auto animate-slide-in-right">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-yellow-400">Round Results</h2>
                  <button
                    onClick={() => setShowScoreboardPanel(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Round Scores */}
                <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-yellow-600">
                  <h3 className="text-lg font-semibold text-yellow-400 mb-3">Scores</h3>
                  {Object.entries(revealedHands.scores || {}).map(([uid, score]: [string, any]) => {
                    const playerName = revealedHands.player_names?.[uid] || "Unknown";
                    return (
                      <div key={uid} className="flex justify-between py-2 border-b border-gray-700 last:border-0">
                        <span className={uid === user?.id ? "text-yellow-400 font-semibold" : "text-gray-300"}>
                          {playerName}
                        </span>
                        <span className={`font-bold ${score === 0 ? "text-green-400" : "text-red-400"}`}>
                          {score} pts
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* All Players' Hands */}
                <div className="space-y-6">
                  {Object.entries(revealedHands.organized_melds || {}).map(([uid, melds]: [string, any]) => {
                    const playerName = revealedHands.player_names?.[uid] || "Unknown";
                    const playerScore = revealedHands.scores?.[uid] || 0;
                    const isWinner = playerScore === 0;

                    return (
                      <div key={uid} className="p-4 bg-gray-800 rounded-lg border-2" style={{
                        borderColor: isWinner ? "#10b981" : "#6b7280"
                      }}>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className={`font-bold text-lg ${
                            isWinner ? "text-green-400" : uid === user?.id ? "text-yellow-400" : "text-gray-300"
                          }`}>
                            {playerName}
                            {isWinner && " 🏆"}
                          </h4>
                          <span className={`font-bold ${playerScore === 0 ? "text-green-400" : "text-red-400"}`}>
                            {playerScore} pts
                          </span>
                        </div>

                        {melds && melds.length > 0 ? (
                          <div className="space-y-3">
                            {melds.map((meld: any, idx: number) => {
                              const meldType = meld.type || "unknown";
                              let bgColor = "bg-gray-700";
                              let borderColor = "border-gray-600";
                              let label = "Cards";

                              if (meldType === "pure") {
                                bgColor = "bg-blue-900/40";
                                borderColor = "border-blue-500";
                                label = "Pure Sequence";
                              } else if (meldType === "impure") {
                                bgColor = "bg-purple-900/40";
                                borderColor = "border-purple-500";
                                label = "Impure Sequence";
                              } else if (meldType === "set") {
                                bgColor = "bg-orange-900/40";
                                borderColor = "border-orange-500";
                                label = "Set";
                              }

                              return (
                                <div key={idx} className={`p-3 rounded border ${bgColor} ${borderColor}`}>
                                  <div className="text-xs text-gray-400 mb-2">{label}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {(meld.cards || []).map((card: any, cardIdx: number) => (
                                      <div key={cardIdx} className="text-sm font-mono bg-white text-gray-900 px-2 py-1 rounded">
                                        {card.name || card.code || "??"}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm">No melds</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Next Round Button */}
                {revealedHands.can_start_next && (
                  <button
                    onClick={async () => {
                      try {
                        await apiclient.start_next_round();
                        setShowScoreboardPanel(false);
                        setRevealedHands(null);
                        await refresh();
                        toast.success("New round started!");
                      } catch (error) {
                        console.error("Error starting next round:", error);
                        toast.error("Failed to start next round");
                      }
                    }}
                    className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    Start Next Round
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Chat Sidebar - Fixed position */}
          {user && info && tableId && (
            <ChatSidebar
              tableId={tableId}
              currentUserId={user.id}
              players={info.players.map(p => ({
                userId: p.user_id,
                displayName: p.display_name || p.user_id.slice(0, 6)
              }))}
            />
          )}

          {/* Voice Panel - Fixed position */}
          {user && info && tableId && (
            <VoicePanel
              tableId={tableId}
              currentUserId={user.id}
              isHost={info.host_user_id === user.id}
              players={info.players}
            />
          )}
        </div>
      </div>
    </div>
  );
}
