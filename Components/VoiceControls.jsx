import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  tableId: string;
  onToggleAudio: (enabled: boolean) => void;
  onToggleVideo: (enabled: boolean) => void;
}

export const VoiceControls: React.FC<Props> = ({ tableId, onToggleAudio, onToggleVideo }) => {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);

  const toggleAudio = () => {
    const newState = !audioEnabled;
    setAudioEnabled(newState);
    onToggleAudio(newState);
  };

  const toggleVideo = () => {
    const newState = !videoEnabled;
    setVideoEnabled(newState);
    onToggleVideo(newState);
  };

  return (
    <div className="fixed bottom-4 left-4 flex gap-2 z-40">
      {/* Audio Toggle */}
      <Button
        onClick={toggleAudio}
        className={`rounded-full p-3 ${
          audioEnabled
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-red-600 hover:bg-red-700'
        }`}
        title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
      >
        {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </Button>

      {/* Video Toggle */}
      <Button
        onClick={toggleVideo}
        className={`rounded-full p-3 ${
          videoEnabled
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-slate-600 hover:bg-slate-700'
        }`}
        title={videoEnabled ? 'Disable Camera' : 'Enable Camera'}
      >
        {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </Button>
    </div>
  );
};
