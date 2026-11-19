export interface SystemSettings {
  id: number;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  performance_order: number;
  video_url: string | null;
  video_storage_path: string | null;
  teammate_bonus: number; // 0 or 3
  lucky_star: number;     // -5, 0, or 5
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  username: string;
  name: string;
  department?: string;
  is_active: boolean;
  auth_user_id?: string;
  created_at?: string;
}

export interface Vote {
  id: string;
  participant_id: string;
  team_id: string;
  vocal_score: number;       // 1 - 25
  performance_score: number; // 1 - 25
  created_at: string;
  updated_at: string;
}

export interface TeamBoardItem {
  id: string;
  name: string;
  performance_order: number;
  video_url: string | null;
  video_storage_path: string | null;
  audience_score: number;    // Computed audience score (average or sum as per spec)
  vote_count: number;
  teammate_bonus: number;
  lucky_star: number;
  has_voted?: boolean;
  my_vocal_score?: number | null;
  my_performance_score?: number | null;
}

export interface ImportParticipantResult {
  row: number;
  username: string;
  name: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: ImportParticipantResult[];
}
