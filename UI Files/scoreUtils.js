export function computeScoresAfterDeclare(roomState, declarerId) {
  const aceValue = roomState.settings.aceValue || 1;
  const result = {};
  const declarer = roomState.players.find(p => p.id === declarerId);
  const isValid = roomState.serverValidationResult || false;
  if (!isValid) {
    result[declarerId] = { delta: 80, reason: 'Invalid declare' };
    roomState.players.forEach(p => {
      if (p.id !== declarerId) result[p.id] = { delta: 0 };
    });
  } else {
    roomState.players.forEach(p => {
      if (p.id === declarerId) result[p.id] = { delta: 0 };
      else {
        const deadwood = calculateDeadwood(p.remainingCards || [], aceValue);
        result[p.id] = { delta: deadwood };
      }
    });
  }
  return result;
}

function calculateDeadwood(cards, aceValue) {
  let total = 0;
  cards.forEach(c => {
    if (!c) return;
    if (c.rank === 'A') total += aceValue;
    else if (['J','Q','K'].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  });
  return total;
}
