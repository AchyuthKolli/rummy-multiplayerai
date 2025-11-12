import { useState, useEffect } from 'react';
import { apiClient } from 'app';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, PhoneOff, Mic, MicOff, Volume2, X, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Participant {
  user_id: string;
  display_name: string;
  is_muted: boolean;
  is_speaking: boolean;
}

interface Props {
  tableId: string;
  currentUserId: string;
  isHost: boolean;
  players: Array<{ user_id: string; display_name?: string | null }>;
}

export default function VoicePanel({ tableId, currentUserId, isHost, players }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myMuted, setMyMuted] = useState(false);

  // Poll for voice participants every 2 seconds when in call
  useEffect(() => {
    if (!inCall) return;

    const fetchParticipants = async () => {
      try {
        const res = await apiClient.get_voice_participants({ table_id: tableId });
        const data = await res.json();
        setParticipants(data.participants || []);
      } catch (error) {
        console.error('Failed to fetch voice participants:', error);
      }
    };

    fetchParticipants();
    const interval = setInterval(fetchParticipants, 2000);
    return () => clearInterval(interval);
  }, [tableId, inCall]);

  const toggleCall = () => {
    setInCall(!inCall);
    if (!inCall) {
      setIsOpen(true);
      toast.success('Joined voice call');
    } else {
      toast.success('Left voice call');
    }
  };

  const toggleMyMute = async () => {
    try {
      await apiClient.mute_player({
        table_id: tableId,
        user_id: currentUserId,
        muted: !myMuted
      });
      setMyMuted(!myMuted);
      toast.success(myMuted ? 'Unmuted' : 'Muted');
    } catch (error) {
      toast.error('Failed to toggle mute');
    }
  };

  const mutePlayer = async (userId: string, muted: boolean) => {
    if (!isHost) return;
    try {
      await apiClient.mute_player({
        table_id: tableId,
        user_id: userId,
        muted
      });
      toast.success(`Player ${muted ? 'muted' : 'unmuted'}`);
    } catch (error) {
      toast.error('Failed to mute player');
    }
  };

  const muteAll = async () => {
    if (!isHost) return;
    try {
      await apiClient.update_table_voice_settings({
        table_id: tableId,
        mute_all: true
      });
      toast.success('All players muted');
    } catch (error) {
      toast.error('Failed to mute all');
    }
  };

  // Floating call button when panel is closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed top-8 right-4 z-40 px-3 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm transition-all ${
          inCall
            ? 'bg-green-700 hover:bg-green-600 text-green-100 animate-pulse'
            : 'bg-green-800 hover:bg-green-700 text-green-100'
        }`}
      >
        <ChevronRight className="w-4 h-4" />
        Call
        {inCall && (
          <span className="ml-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-30 w-80 bg-slate-900 border-2 border-slate-700 rounded-lg shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-white">Voice Call</h3>
          {inCall && (
            <span className="px-2 py-0.5 text-xs bg-green-600 text-white rounded-full">
              Live
            </span>
          )}
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Participants List */}
      <ScrollArea className="h-64 p-3">
        {!inCall && (
          <div className="text-center py-8 text-slate-400">
            <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Join the voice call to see participants</p>
          </div>
        )}
        {inCall && participants.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm">Waiting for others to join...</p>
          </div>
        )}
        {inCall && participants.length > 0 && (
          <div className="space-y-2">
            {participants.map((participant) => {
              const isMe = participant.user_id === currentUserId;
              return (
                <div
                  key={participant.user_id}
                  className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                    participant.is_speaking
                      ? 'bg-green-900/30 border-2 border-green-500 shadow-lg'
                      : 'bg-slate-800 border border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar with speaking indicator */}
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        participant.is_speaking
                          ? 'bg-green-600 animate-pulse'
                          : 'bg-slate-700'
                      }`}>
                        <span className="text-white font-semibold text-sm">
                          {(participant.display_name || participant.user_id).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      {participant.is_speaking && (
                        <Volume2 className="absolute -bottom-1 -right-1 w-4 h-4 text-green-400 animate-bounce" />
                      )}
                    </div>

                    {/* Name */}
                    <div>
                      <p className={`font-medium ${
                        isMe ? 'text-green-400' : 'text-white'
                      }`}>
                        {participant.display_name || participant.user_id.slice(0, 8)}
                        {isMe && ' (You)'}
                      </p>
                      {participant.is_speaking && (
                        <p className="text-xs text-green-400">Speaking...</p>
                      )}
                    </div>
                  </div>

                  {/* Mute controls */}
                  <div className="flex items-center gap-1">
                    {participant.is_muted ? (
                      <MicOff className="w-4 h-4 text-red-400" />
                    ) : (
                      <Mic className="w-4 h-4 text-green-400" />
                    )}
                    {isHost && !isMe && (
                      <Button
                        onClick={() => mutePlayer(participant.user_id, !participant.is_muted)}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                      >
                        {participant.is_muted ? 'Unmute' : 'Mute'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer Controls */}
      <div className="p-3 border-t border-slate-700 bg-slate-800 space-y-2">
        {/* Host controls */}
        {isHost && inCall && (
          <Button
            onClick={muteAll}
            variant="outline"
            size="sm"
            className="w-full bg-slate-700 hover:bg-slate-600"
          >
            <MicOff className="w-4 h-4 mr-2" />
            Mute All
          </Button>
        )}

        {/* Main call controls */}
        <div className="flex gap-2">
          {inCall && (
            <Button
              onClick={toggleMyMute}
              variant="outline"
              className={`flex-1 ${
                myMuted
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {myMuted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {myMuted ? 'Unmute' : 'Mute'}
            </Button>
          )}
          <Button
            onClick={toggleCall}
            className={`flex-1 ${
              inCall
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {inCall ? (
              <>
                <PhoneOff className="w-4 h-4 mr-2" />
                Leave Call
              </>
            ) : (
              <>
                <Phone className="w-4 h-4 mr-2" />
                Join Call
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
