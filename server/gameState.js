// server/gameState.js
// Utility functions to manage game rules

const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 10, 'Q': 10, 'K': 10,
  'A': 1 // use aceValue substitution later
};

function getDeckCount(playerCount) {
  if (playerCount <= 2) return 1;
  if (playerCount <= 4) return 2;
  return 3; // 5 or 6
}

// cards: array like [{rank:'3', suit:'H'}, ...]
// aceValue: 1 or 10
function calculateDeadwood(cards, aceValue = 1) {
  let total = 0;
  for (const c of cards) {
    if (!c) continue;
    if (c.rank === 'A') total += aceValue;
    else if (['J','Q','K'].includes(c.rank)) total += 10;
    else total += (RANK_VALUE[c.rank] || parseInt(c.rank, 10) || 0);
  }
  return total;
}

// Apply a declare result for the table. `room` is server-side room object storing players, etc.
// declarerId: socketId or playerId who declared
// isValid: boolean result of server validation
function applyDeclareResult(room, declarerId, isValid) {
  const declarer = room.players.find(p => p.id === declarerId);
  if (!declarer) return;

  if (!isValid) {
    // invalid declare: declarer gets 80 points penalty; others 0 for the round
    declarer.score = (declarer.score || 0) + 80;
    room.history = room.history || [];
    room.history.push({ roundResult: 'invalid', declarerId, penalty: 80 });
  } else {
    // valid: declarer 0 points, others get deadwood
    const aceValue = (room.settings && room.settings.aceValue) || 1;
    room.history = room.history || [];
    for (const p of room.players) {
      if (p.id === declarerId) {
        // declarer gets 0
        room.history.push({ playerId: p.id, delta: 0 });
      } else {
        const deadwood = calculateDeadwood(p.remainingCards || [], aceValue);
        p.score = (p.score || 0) + deadwood;
        room.history.push({ playerId: p.id, delta: deadwood });
      }
    }
    room.history.push({ roundResult: 'valid', declarerId });
  }
}

module.exports = { getDeckCount, calculateDeadwood, applyDeclareResult };
