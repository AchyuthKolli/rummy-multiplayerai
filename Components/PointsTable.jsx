import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import type { TableInfoResponse } from '../apiclient/data-contracts';

export interface Props {
  info: TableInfoResponse;
  roundHistory: Array<{
    round_number: number;
    winner_user_id: string | null;
    scores: Record<string, number>;
  }>;
}

export const PointsTable: React.FC<Props> = ({ info, roundHistory }) => {
  const [isOpen, setIsOpen] = useState(true);

  // Calculate cumulative scores
  const cumulativeScores: Record<string, number[]> = {};
  info.players.forEach(player => {
    cumulativeScores[player.user_id] = [];
  });

  let runningTotals: Record<string, number> = {};
  info.players.forEach(player => {
    runningTotals[player.user_id] = 0;
  });

  roundHistory.forEach(round => {
    info.players.forEach(player => {
      const roundScore = round.scores[player.user_id] || 0;
      runningTotals[player.user_id] += roundScore;
      cumulativeScores[player.user_id].push(runningTotals[player.user_id]);
    });
  });

  if (roundHistory.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-20 bg-card border border-border rounded-lg shadow-lg w-96">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          <span className="font-semibold text-foreground">Points Table</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-3 border-t border-border max-h-96 overflow-y-auto">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 font-semibold text-foreground">Player</th>
                  {roundHistory.map((round, idx) => (
                    <th key={idx} className="text-center py-2 px-2 font-semibold text-foreground">
                      R{round.round_number}
                    </th>
                  ))}
                  <th className="text-right py-2 px-2 font-semibold text-yellow-600 dark:text-yellow-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {info.players.map(player => {
                  const totalScore = runningTotals[player.user_id] || 0;
                  return (
                    <tr key={player.user_id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-2 px-2 text-foreground">
                        <div className="flex items-center gap-1">
                          {player.display_name || 'Player'}
                        </div>
                      </td>
                      {roundHistory.map((round, idx) => {
                        const isWinner = round.winner_user_id === player.user_id;
                        const roundScore = round.scores[player.user_id] || 0;
                        return (
                          <td key={idx} className="text-center py-2 px-2">
                            <div className="flex flex-col items-center">
                              <span className={isWinner ? 'text-green-600 dark:text-green-500 font-semibold' : 'text-muted-foreground'}>
                                {roundScore}
                              </span>
                              {isWinner && <Trophy className="w-3 h-3 text-yellow-500" />}
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-right py-2 px-2">
                        <span className="font-bold text-yellow-600 dark:text-yellow-500">
                          {totalScore}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
