export interface UserProfile {
  id: number;
  username: string;
  full_name?: string;
  avatar_url?: string;
  permalink_url: string;
  followers_count?: number;
  track_count?: number;
}

export interface Session {
  auth_token?: string;
  user?: UserProfile;
  is_authenticated: boolean;
}
