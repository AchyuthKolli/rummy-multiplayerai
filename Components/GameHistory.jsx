import React, { useState, useEffect } from 'react';
import { apiClient } from 'app';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, X, Trophy, AlertTriangle } from 'lucide-react';

interface Props {
  tableId: string;
}

export const GameHistory: React.FC<Props> = ({ tableId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, tableId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get_round_history({ table_id: tableId });
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-20 right-4 bg-slate-700 hover:bg-slate-600 z-40"
        title="View Game History"
      >
        <History className="w-4 h-4 mr-2" />
        History
      </Button>

      {/* History Panel */}
      {isOpen && (
        <div className="fixed right-0 top-0 h-full w-96 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
            <h3 className="font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-500" />
              Game History
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1 p-4">
            {loading ? (
              <div className="text-center text-slate-400 py-8">Loading...</div>
            ) : history ? (
              <div className="space-y-6">
                {/* Disqualified Players */}
                {history.disqualified_players?.length > 0 && (
                  <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
                    <h4 className="font-bold text-red-400 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Disqualified
                    </h4>
                    {history.disqualified_players.map((p: any) => (
                      <div key={p.user_id} className="text-sm text-red-300">
                        {p.email?.split('@')[0]} - {p.cumulative_score} pts
                      </div>
                    ))}
                  </div>
                )}

                {/* Near Disqualification */}
                {history.near_disqualification?.length > 0 && (
                  <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
                    <h4 className="font-bold text-amber-400 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      At Risk
                    </h4>
                    {history.near_disqualification.map((p: any) => (
                      <div key={p.user_id} className="text-sm text-amber-300">
                        {p.email?.split('@')[0]} - {p.cumulative_score} pts
                      </div>
                    ))}
                  </div>
                )}

                {/* Round History */}
                <div>
                  <h4 className="font-bold text-white mb-3">Rounds ({history.total_rounds})</h4>
                  <div className="space-y-4">
                    {history.rounds?.map((round: any) => (
                      <div key={round.round} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                        <div className="font-bold text-green-400 mb-2">Round {round.round}</div>
                        <div className="space-y-1">
                          {round.players?.map((p: any, idx: number) => (
                            <div key={p.user_id} className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                {idx === 0 && <Trophy className="w-3 h-3 text-amber-400" />}
                                <span className={idx === 0 ? 'text-amber-300 font-bold' : 'text-slate-300'}>
                                  {p.user_email?.split('@')[0]}
                                </span>
                              </span>
                              <span className={idx === 0 ? 'text-green-400 font-bold' : 'text-red-400'}>
                                {p.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-8">No history available</div>
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
};
