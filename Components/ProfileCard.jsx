import React, { useEffect, useState } from "react";
import apiclient from "../apiclient";
import type { GetMyProfileData } from "../apiclient/data-contracts";
import { useUser } from "@stackframe/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export interface Props {}

export const ProfileCard: React.FC<Props> = () => {
  const user = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<GetMyProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return; // not signed in yet
      setLoading(true);
      setError(null);
      try {
        const res = await apiclient.get_my_profile();
        const data = await res.json();
        setProfile(data);
      } catch (e: any) {
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Sign in to manage your profile.</p>
          <button
            onClick={() => navigate("/auth/sign-in")}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium">Your Profile</h3>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>
      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Display Name</label>
          <input
            value={profile?.display_name || user?.displayName || 'Anonymous'}
            readOnly
            className="w-full px-3 py-2 bg-muted/50 border border-input rounded-md text-foreground cursor-not-allowed"
          />
        </div>
        {profile && (
          <p className="text-xs text-muted-foreground">User ID: <span className="text-foreground">{profile.user_id}</span></p>
        )}
      </div>
    </div>
  );
};
