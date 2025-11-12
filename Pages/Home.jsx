import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sparkles, Eye, EyeOff, LogIn, User2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import apiclient from '../apiclient';
import type { JoinByCodeRequest } from '../apiclient/data-contracts';
import { useUser } from '@stackframe/react';
import { stackClientApp } from 'app/auth';

interface GameVariant {
  id: string;
  title: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  color: string;
}

const gameVariants: GameVariant[] = [
  {
    id: 'no_wildcard',
    title: 'No Wild Card',
    description: 'Pure classic rummy with printed jokers only',
    features: [
      'No wild joker cards',
      'Only printed jokers',
      'Simpler strategy',
      'Perfect for beginners'
    ],
    icon: <EyeOff className="w-12 h-12" />,
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'open_wildcard',
    title: 'Open Wild Card',
    description: 'Traditional rummy with wild card revealed at start',
    features: [
      'Wild card shown immediately',
      'Traditional gameplay',
      'Strategic substitutions',
      'Classic experience'
    ],
    icon: <Eye className="w-12 h-12" />,
    color: 'from-green-500 to-emerald-500'
  },
  {
    id: 'close_wildcard',
    title: 'Close Wild Card',
    description: 'Advanced variant - wild card reveals after first sequence',
    features: [
      'Hidden wild card initially',
      'Reveals after pure sequence',
      'Advanced strategy',
      'Maximum challenge'
    ],
    icon: <Sparkles className="w-12 h-12" />,
    color: 'from-purple-500 to-pink-500'
  }
];

export default function App() {
  const navigate = useNavigate();
  const user = useUser();
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);

  const handleSelectVariant = (variantId: string) => {
    navigate(`/CreateTable?variant=${variantId}`);
  };

  const handleJoinRoom = async () => {
    if (!user) {
      toast.error('Please sign in to join a room');
      return;
    }
    if (!playerName.trim() || roomCode.trim().length !== 6) {
      toast.error('Enter your name and a valid 6-letter code');
      return;
    }
    setJoining(true);
    try {
      const body: JoinByCodeRequest = { code: roomCode.trim().toUpperCase() };
      const res = await apiclient.join_table_by_code(body);
      
      // Check if response is ok
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
        const errorMsg = errorData.detail || errorData.message || 'Failed to join room';
        toast.error(`Join failed: ${errorMsg}`);
        setJoining(false);
        return;
      }
      
      const data = await res.json();
      
      toast.success(`Joined table! Seat ${data.seat}`);
      navigate(`/Table?tableId=${data.table_id}`);
    } catch (e: any) {
      console.error('Join room error:', e);
      const errorMsg = e.message || e.detail || 'Failed to join room. Check the code and try again.';
      toast.error(errorMsg);
    } finally {
      setJoining(false);
    }
  };

  const handleSignIn = () => {
    stackClientApp.redirectToSignIn();
  };

  const handleSignOut = async () => {
    await stackClientApp.signOut();
    toast.success('Signed out successfully');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white tracking-tight">Rummy Room</h1>
              <p className="text-slate-400 mt-2">Choose your game variant</p>
            </div>
            
            {/* Auth Section */}
            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-3">
                  {/* Profile Picture */}
                  <div className="w-10 h-10 rounded-full border-2 border-green-500 overflow-hidden bg-slate-700 flex items-center justify-center">
                    <User2 className="w-5 h-5 text-white" />
                  </div>
                  
                  {/* User Name */}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white">
                      {user.displayName || 'Player'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {user.primaryEmail}
                    </span>
                  </div>
                  
                  {/* Sign Out Button */}
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    size="sm"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleSignIn}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90 text-white font-semibold"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Game Variants Grid */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {gameVariants.map((variant) => (
            <Card
              key={variant.id}
              className="group relative overflow-hidden bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-all duration-300 hover:scale-105 cursor-pointer"
              onClick={() => handleSelectVariant(variant.id)}
            >
              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${variant.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
              
              <div className="relative p-8">
                {/* Icon */}
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${variant.color} flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform`}>
                  {variant.icon}
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-white mb-3">{variant.title}</h2>
                
                {/* Description */}
                <p className="text-slate-400 mb-6">{variant.description}</p>

                {/* Features */}
                <ul className="space-y-2 mb-8">
                  {variant.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center text-sm text-slate-300">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${variant.color} mr-3`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Button */}
                <Button
                  className={`w-full bg-gradient-to-r ${variant.color} hover:opacity-90 text-white font-semibold`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectVariant(variant.id);
                  }}
                >
                  Play {variant.title}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Join Table Section */}
        <div className="mt-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Join a Friend's Game</h2>
            <p className="text-slate-400">Enter the 6-letter room code shared by your friend</p>
          </div>

          <Card className="max-w-2xl mx-auto bg-slate-800/50 border-slate-700 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Join Room</h3>
                <p className="text-sm text-slate-400">Enter details to join the table</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Your Name
                </label>
                <Input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Room Code
                </label>
                <Input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-letter code"
                  maxLength={6}
                  className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 uppercase tracking-wider text-lg font-mono text-center"
                />
              </div>

              <Button
                onClick={handleJoinRoom}
                disabled={joining || !playerName.trim() || roomCode.length !== 6 || !user}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90 text-white font-semibold py-6 text-lg"
              >
                {joining ? 'Joining...' : 'Join Game'}
              </Button>

              {!user && (
                <p className="text-sm text-amber-400 text-center">Please sign in to join a room</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
