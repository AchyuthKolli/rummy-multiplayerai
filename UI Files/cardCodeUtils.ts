/**
 * Parse a card code like "7S" into a CardView object
 * 
 * @param code - The card code string (e.g., "7S", "KH", "JOKER")
 * @returns Object with rank, suit, joker flag, and original code
 */
export const parseCardCode = (code: string): { rank: string; suit: string | null; joker: boolean; code: string } => {
  if (!code) return { rank: '', suit: null, joker: false, code: '' };
  
  // Try to parse as JSON first (in case it's already an object)
  try {
    const parsed = JSON.parse(code);
    if (parsed.rank) return parsed;
  } catch {}
  
  // Handle joker cards
  if (code === 'JOKER') {
    return { rank: 'JOKER', suit: null, joker: true, code };
  }
  
  // Parse standard card codes (e.g., "7S" -> rank="7", suit="S")
  const suit = code.slice(-1);
  const rank = code.slice(0, -1) || code;
  
  return {
    rank,
    suit: suit && ['S', 'H', 'D', 'C'].includes(suit) ? suit : null,
    joker: false,
    code
  };
};
