import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from 'app';

interface Props {
  tableId: string;
  currentUserId: string;
  isEliminated: boolean;
  spectateRequests: string[];
  isHost: boolean;
  players: Array<{ user_id: string; display_name?: string | null }>;
}

export default function SpectateControls({ 
  tableId, 
  currentUserId, 
  isEliminated, 
  spectateRequests,
  isHost,
  players 
}: Props) {
  const [requesting, setRequesting] = useState(false);
  const [granting, setGranting] = useState<string | null>(null);

  const handleRequestSpectate = async () => {
    setRequesting(true);
    try {
      await apiClient.request_spectate({ table_id: tableId });
      toast.success('Spectate request sent to host');
    } catch (error) {
      toast.error('Failed to request spectate access');
    } finally {
      setRequesting(false);
    }
  };

  const handleGrantSpectate = async (userId: string, granted: boolean) => {
    setGranting(userId);
    try {
      await apiClient.grant_spectate({ 
        table_id: tableId, 
        user_id: userId,
        granted 
      });
      toast.success(granted ? 'Spectate access granted' : 'Spectate access denied');
    } catch (error) {
      toast.error('Failed to process spectate request');
    } finally {
      setGranting(null);
    }
  };

  const getUserName = (userId: string) => {
    const player = players.find(p => p.user_id === userId);
    return player?.display_name || userId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      {/* Eliminated Player - Request to Spectate */}
      {isEliminated && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">You've been eliminated</h3>
          </div>
          <p className="text-sm text-slate-300 mb-3">
            Request permission from the host to spectate the remaining players
          </p>
          <Button
            onClick={handleRequestSpectate}
            disabled={requesting}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Eye className="w-4 h-4 mr-2" />
            {requesting ? 'Requesting...' : 'Request to Spectate'}
          </Button>
        </div>
      )}

      {/* Host - Pending Spectate Requests */}
      {isHost && spectateRequests.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-white">Spectate Requests</h3>
            <span className="ml-auto bg-amber-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {spectateRequests.length}
            </span>
          </div>
          <div className="space-y-2">
            {spectateRequests.map((userId) => (
              <div key={userId} className="flex items-center justify-between bg-slate-700/50 rounded p-3">
                <span className="text-white font-medium">{getUserName(userId)}</span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleGrantSpectate(userId, true)}
                    disabled={granting === userId}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => handleGrantSpectate(userId, false)}
                    disabled={granting === userId}
                    size="sm"
                    variant="destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
