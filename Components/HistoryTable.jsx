import { useState, useEffect } from 'react';
import { apiClient } from 'app';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trophy, Users, Crown, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface HistoryEntry {
  round_number: number;
  winner_user_id: string | null;
  winner_name: string | null;
  disqualified_users: string[];
  completed_at: string;
}

interface Props {
  tableId: string;
}

export default function HistoryTable({ tableId }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await apiClient.get_round_history({ table_id: tableId });
        const data = await response.json();
        setHistory(data.rounds || []);
      } catch (error) {
        console.error('Failed to fetch round history:', error);
        toast.error('Failed to load game history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [tableId]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center p-8 text-slate-400">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No rounds completed yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 p-4">
        {history.map((round) => (
          <div 
            key={round.round_number}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="bg-green-900/30 rounded-full p-2">
                  <Trophy className="w-4 h-4 text-green-400" />
                </div>
                <span className="font-semibold text-white">Round {round.round_number}</span>
              </div>
              <span className="text-xs text-slate-400">
                {formatTimestamp(round.completed_at)}
              </span>
            </div>

            {/* Winner */}
            {round.winner_user_id && (
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-amber-400 font-medium">
                  Winner: {round.winner_name || round.winner_user_id.slice(0, 8)}
                </span>
              </div>
            )}

            {/* Disqualified Players */}
            {round.disqualified_users.length > 0 && (
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-red-400 font-medium mb-1">Disqualified:</p>
                  <div className="flex flex-wrap gap-1">
                    {round.disqualified_users.map((userId) => (
                      <span 
                        key={userId}
                        className="text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded"
                      >
                        {userId.slice(0, 8)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
