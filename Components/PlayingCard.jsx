import React from "react";
import type { CardView } from "../apiclient/data-contracts";

export interface Props {
  card: CardView;
  onClick?: () => void;
  selected?: boolean;
}

const suitSymbols: Record<string, string> = {
  H: "♥",
  D: "♦",
  S: "♠",
  C: "♣",
};

const suitColors: Record<string, string> = {
  H: "text-red-500",
  D: "text-red-500",
  S: "text-gray-900",
  C: "text-gray-900",
};

export const PlayingCard: React.FC<Props> = ({ card, onClick, selected }) => {
  const isJoker = card.joker || card.rank === "JOKER";
  const suit = card.suit || "";
  const suitSymbol = suitSymbols[suit] || "";
  const suitColor = suitColors[suit] || "text-gray-900 dark:text-gray-100";

  return (
    <div
      onClick={onClick}
      className={`
        relative w-full aspect-[2/3] min-w-[60px] max-w-[100px] rounded-lg bg-white dark:bg-gray-100 
        border-2 shadow-md transition-all cursor-pointer touch-manipulation
        hover:scale-105 hover:shadow-lg active:scale-95
        ${selected ? "border-amber-500 ring-2 ring-amber-400 scale-105" : "border-gray-300"}
        ${onClick ? "" : "cursor-default"}
      `}
      title={card.code}
    >
      <div className="absolute inset-0 p-1 sm:p-2 flex flex-col items-center justify-center">
        {isJoker ? (
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">★</div>
            <div className="text-xs font-semibold text-purple-600 mt-1">JOKER</div>
          </div>
        ) : (
          <>
            <div className={`text-xs font-bold ${suitColor} absolute top-1 left-2`}>
              {card.rank}
            </div>
            <div className={`text-3xl font-bold ${suitColor}`}>
              {suitSymbol}
            </div>
            <div className={`text-lg font-bold ${suitColor} mt-1`}>
              {card.rank}
            </div>
            <div className={`text-xs font-bold ${suitColor} absolute bottom-1 right-2 rotate-180`}>
              {card.rank}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
