import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Users, Trophy, Crown, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import apiclient from '../apiclient';
import type { CreateTableRequest } from '../apiclient/data-contracts';
import { useUser } from '@stackframe/react';

interface VariantConfig {
  id: string;
  title: string;
  wildJokerMode: 'no_joker' | 'close_joker' | 'open_joker';
  description: string;
  color: string;
}

const variantConfigs: Record<string, VariantConfig> = {
  no_wildcard: {
    id: 'no_wildcard',
    title: 'No Wild Card',
    wildJokerMode: 'no_joker',
    description: 'Pure classic rummy with printed jokers only',
    color: 'from-blue-500 to-cyan-500'
  },
  open_wildcard: {
    id: 'open_wildcard',
    title: 'Open Wild Card',
    wildJokerMode: 'open_joker',
    description: 'Traditional rummy with wild card revealed at start',
    color: 'from-green-500 to-emerald-500'
  },
  close_wildcard: {
    id: 'close_wildcard',
    title: 'Close Wild Card',
    wildJokerMode: 'close_joker',
    description: 'Advanced variant - wild card reveals after first sequence',
    color: 'from-purple-500 to-pink-500'
  }
};

export default function CreateTable() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const user = useUser();
  const variantId = sp.get('variant') || 'open_wildcard';
  const variant = variantConfigs[variantId] || variantConfigs.open_wildcard;

  const [playerName, setPlayerName] = useState('Player');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [disqualifyScore, setDisqualifyScore] = useState(200);
  const [aceValue, setAceValue] = useState<1 | 10>(10);
  const [creating, setCreating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [tableId, setTableId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user?.displayName) {
      setPlayerName(user.displayName);
    }
  }, [user]);

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      toast.error('Enter your name');
      return;
    }
    
    // STRICT VALIDATION - prevent constraint violations
    if (aceValue !== 1 && aceValue !== 10) {
      toast.error(`Invalid ace value: ${aceValue}. Please refresh your browser (Ctrl+Shift+R)`);
      console.error('❌ INVALID ACE VALUE:', aceValue, 'Expected: 1 or 10');
      return;
    }
    if (!variant.wildJokerMode || variant.wildJokerMode === '') {
      toast.error('Invalid game mode. Please refresh your browser (Ctrl+Shift+R)');
      console.error('❌ INVALID WILD JOKER MODE:', variant.wildJokerMode);
      return;
    }
    
    setCreating(true);
    try {
      const body: CreateTableRequest = {
        max_players: maxPlayers,
        disqualify_score: disqualifyScore,
        wild_joker_mode: variant.wildJokerMode,
        ace_value: aceValue,
      };
      
      // 🔍 DETAILED FRONTEND LOGGING - Check console!
      console.log('🎯 [CREATE TABLE DEBUG]', {
        variantId,
        variantTitle: variant.title,
        wildJokerMode: variant.wildJokerMode,
        wildJokerModeType: typeof variant.wildJokerMode,
        aceValue,
        aceValueType: typeof aceValue,
        fullBody: body,
        timestamp: new Date().toISOString()
      });
      
      const res = await apiclient.create_table(body);
      const data = await res.json();
      
      setGeneratedCode(data.code);
      setTableId(data.table_id);
      toast.success('Room created successfully!');
    } catch (e: any) {
      console.error('❌ [CREATE TABLE ERROR]', e);
      const errorMsg = e?.error?.detail || e?.message || 'Failed to create room';
      toast.error(`Error: ${errorMsg}. Try refreshing (Ctrl+Shift+R)`);
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = () => {
    if (tableId) {
      navigate(`/Table?tableId=${tableId}`);
    }
  };

  const copyToClipboard = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (generatedCode && tableId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header */}
        <div className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <h1 className="text-3xl font-bold text-white tracking-tight">{variant.title}</h1>
            <p className="text-slate-400 mt-1">{variant.description}</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-12">
          <Card className="bg-slate-800/50 border-slate-700 p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-4">
                <Crown className="w-10 h-10 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Room Created!</h2>
              <p className="text-slate-400">Share this code with your friends</p>
            </div>

            {/* Room Code Display */}
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 border-2 border-slate-600 rounded-xl p-8 mb-8">
              <p className="text-sm text-slate-400 text-center mb-3">Room Code</p>
              <p className="text-5xl font-bold text-center text-white tracking-wider mb-6 font-mono">
                {generatedCode}
              </p>
              <Button
                onClick={copyToClipboard}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 mr-2" />
                    Copy Code
                  </>
                )}
              </Button>
            </div>

            {/* Room Details */}
            <div className="space-y-3 mb-8 bg-slate-900/50 rounded-lg p-6">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Host:</span>
                <span className="text-white font-medium">{playerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Game Mode:</span>
                <span className="text-white font-medium">{variant.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Max Players:</span>
                <span className="text-white font-medium">{maxPlayers}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Disqualify Score:</span>
                <span className="text-white font-medium">{disqualifyScore} pts</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Ace Value:</span>
                <span className="text-white font-medium">{aceValue} pt{aceValue === 1 ? '' : 's'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setGeneratedCode('');
                  setTableId(null);
                  navigate('/');
                }}
                variant="outline"
                className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleStartGame}
                className={`flex-1 bg-gradient-to-r ${variant.color} hover:opacity-90 text-white font-semibold`}
              >
                Go to Table
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Button
            onClick={() => navigate('/')}
            variant="ghost"
            className="text-slate-400 hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Game Selection
          </Button>
          <h1 className="text-3xl font-bold text-white tracking-tight">{variant.title}</h1>
          <p className="text-slate-400 mt-1">{variant.description}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Card className="bg-slate-800/50 border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Create Private Room</h2>

          <div className="space-y-6">
            {/* Player Name */}
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

            {/* Max Players */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <Users className="w-4 h-4 inline mr-2" />
                Maximum Players
              </label>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players</option>
                <option value={5}>5 Players</option>
                <option value={6}>6 Players</option>
              </select>
            </div>

            {/* Disqualification Score */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <Trophy className="w-4 h-4 inline mr-2" />
                Disqualification Score
              </label>
              <select
                value={disqualifyScore}
                onChange={(e) => setDisqualifyScore(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <option value={200}>200 Points</option>
                <option value={300}>300 Points</option>
                <option value={400}>400 Points</option>
                <option value={500}>500 Points</option>
                <option value={600}>600 Points</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Players reaching this score will be disqualified</p>
            </div>

            {/* Ace Value */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Ace Point Value
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAceValue(1)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    aceValue === 1
                      ? `border-transparent bg-gradient-to-r ${variant.color} text-white`
                      : 'border-slate-600 bg-slate-900/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-2xl font-bold">1</div>
                  <div className="text-xs mt-1 opacity-80">Point</div>
                </button>
                <button
                  onClick={() => setAceValue(10)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    aceValue === 10
                      ? `border-transparent bg-gradient-to-r ${variant.color} text-white`
                      : 'border-slate-600 bg-slate-900/50 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="text-2xl font-bold">10</div>
                  <div className="text-xs mt-1 opacity-80">Points</div>
                </button>
              </div>
            </div>

            {/* Create Button */}
            <Button
              onClick={handleCreateRoom}
              disabled={creating || !playerName.trim()}
              className={`w-full bg-gradient-to-r ${variant.color} hover:opacity-90 text-white font-semibold py-6 text-lg mt-8`}
            >
              {creating ? 'Creating Room...' : 'Create Room'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
