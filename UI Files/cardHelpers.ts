/**
 * Format a card code (e.g., "7S") into display components
 */
export const formatCardDisplay = (cardCode: string) => {
  const suitChar = cardCode.slice(-1);
  const suits = ['S', 'H', 'D', 'C'];
  
  if (suits.includes(suitChar)) {
    const rank = cardCode.slice(0, -1);
    const suitSymbol = suitChar === "S" ? "♠" : suitChar === "H" ? "♥" : suitChar === "D" ? "♦" : "♣";
    const suitColor = suitChar === "H" || suitChar === "D" ? "text-red-600" : "text-gray-900";
    return { rank, suitSymbol, suitColor };
  }
  
  // Just rank without suit
  return { rank: cardCode, suitSymbol: "♠", suitColor: "text-gray-900" };
};
