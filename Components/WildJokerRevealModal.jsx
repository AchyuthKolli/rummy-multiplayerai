import React, { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wildJokerRank: string;
}

export const WildJokerRevealModal: React.FC<Props> = ({ isOpen, onClose, wildJokerRank }) => {
  const [isFlipping, setIsFlipping] = useState(false);

  // Start flip animation shortly after modal opens
  useEffect(() => {
    if (isOpen) {
      setIsFlipping(false);
      const timer = setTimeout(() => setIsFlipping(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const formatCardDisplay = (rank: string) => {
    // Extract suit from rank if present (e.g., "7S" -> rank="7", suit="S")
    const suitChar = rank.slice(-1);
    const suits = ['S', 'H', 'D', 'C'];
    
    if (suits.includes(suitChar)) {
      const cardRank = rank.slice(0, -1);
      const suitSymbol = suitChar === "S" ? "♠" : suitChar === "H" ? "♥" : suitChar === "D" ? "♦" : "♣";
      const suitColor = suitChar === "H" || suitChar === "D" ? "text-red-600" : "text-gray-900";
      return { rank: cardRank, suitSymbol, suitColor };
    }
    
    // Just rank without suit
    return { rank, suitSymbol: "♠", suitColor: "text-gray-900" };
  };

  const { rank, suitSymbol, suitColor } = formatCardDisplay(wildJokerRank);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gradient-to-b from-green-900 to-green-950 border-2 border-yellow-500">
        <div className="flex flex-col items-center justify-center py-8 gap-6">
          <h2 className="text-2xl font-bold text-yellow-400">Wild Joker Revealed!</h2>
          
          {/* Card flip container */}
          <div className="perspective-1000">
            <div className={`flip-card ${isFlipping ? 'flipped' : ''}`}>
              <div className="flip-card-inner">
                {/* Card Back */}
                <div className="flip-card-back">
                  <div className="w-32 h-48 bg-gradient-to-br from-red-900 to-red-950 border-2 border-red-700 rounded-lg flex items-center justify-center shadow-2xl">
                    <div className="text-4xl font-bold text-red-300">🃏</div>
                  </div>
                </div>
                
                {/* Card Front */}
                <div className="flip-card-front">
                  <div className="w-32 h-48 bg-white rounded-lg border-2 border-gray-800 flex flex-col items-center justify-center gap-2 shadow-2xl">
                    <div className={`text-6xl font-bold ${suitColor}`}>
                      {rank}
                    </div>
                    <div className={`text-5xl ${suitColor}`}>
                      {suitSymbol}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-green-300 text-lg">
            All <span className="font-bold text-yellow-400">{rank}</span> cards are now wild jokers!
          </p>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition-colors"
          >
            Got it!
          </button>
        </div>
      </DialogContent>

      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        
        .flip-card {
          width: 128px;
          height: 192px;
          position: relative;
          transform-style: preserve-3d;
          transition: transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1);
        }
        
        .flip-card.flipped {
          transform: rotateY(180deg);
        }
        
        .flip-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
        }
        
        .flip-card-front,
        .flip-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        
        .flip-card-front {
          transform: rotateY(180deg);
        }
        
        .flip-card-back {
          transform: rotateY(0deg);
        }
      `}</style>
    </Dialog>
  );
};
