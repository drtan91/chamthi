import { createClient } from '@supabase/supabase-js';
import { mockStore } from './mockData';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dummy-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-anon-key';

/**
 * Utility to extract YouTube Embed URL if given a YouTube watch/shorts/youtu.be link.
 */
export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  return null;
}

/**
 * Convert legacy ID like 'emp-3' to standard Supabase UUID 'e0000000-0000-0000-0000-000000000003'.
 */
export function normalizeParticipantId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (trimmed.startsWith('emp-')) {
    const num = parseInt(trimmed.replace('emp-', ''), 10);
    if (!isNaN(num)) {
      return 'e0000000-0000-0000-0000-' + String(num).padStart(12, '0');
    }
  }
  return trimmed;
}

export const isMockMode =
  !supabaseUrl ||
  supabaseUrl.includes('dummy') ||
  supabaseAnonKey.includes('dummy');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface SubmitVoteResult {
  success: boolean;
  voteId?: string;
  error?: {
    code: string;
    message: string;
    status: number;
  };
}

/**
 * Client SDK wrapper for submit_vote RPC.
 * Automatically falls back to mockStore when running in demo/vibe-coding mode without real Supabase connection.
 */
export async function submitVote(
  teamId: string,
  vocalScore: number,
  performanceScore: number,
  participantId?: string
): Promise<SubmitVoteResult> {
  const rawPartId =
    participantId ||
    localStorage.getItem('mock_participant_id') ||
    (() => {
      try {
        const p = localStorage.getItem('chamthi_participant_session');
        return p ? JSON.parse(p).id : undefined;
      } catch {
        return undefined;
      }
    })();

  const currentPartId = normalizeParticipantId(rawPartId);

  if (isMockMode) {
    return mockStore.submitVote(currentPartId || 'p-1', teamId, vocalScore, performanceScore);
  }

  try {
    // 1. Try RPC submit_vote
    const { data, error } = await supabase.rpc('submit_vote', {
      p_team_id: teamId,
      p_vocal_score: vocalScore,
      p_performance_score: performanceScore,
      p_participant_id: currentPartId || null,
    });

    if (!error) {
      return {
        success: true,
        voteId: typeof data === 'object' && data?.vote_id ? data.vote_id : data,
      };
    }

    const errorMsg = error.message || '';
    const errorDetails = error.details || '';
    if (
      errorMsg.includes('ERR_VOTING_LOCKED') ||
      errorMsg.includes('Đã khóa chấm điểm') ||
      errorDetails.includes('ERR_VOTING_LOCKED') ||
      (error.code === 'P0001' && (errorMsg.includes('khóa') || errorMsg.includes('locked')))
    ) {
      return {
        success: false,
        error: {
          code: 'ERR_VOTING_LOCKED',
          message: 'Đã khóa chấm điểm',
          status: 403,
        },
      };
    }

    // 2. Direct Supabase Fallback if RPC fails or not updated yet
    if (currentPartId) {
      const { data: setts } = await supabase.from('system_settings').select('is_locked').eq('id', 1).maybeSingle();
      if (setts?.is_locked) {
        return {
          success: false,
          error: {
            code: 'ERR_VOTING_LOCKED',
            message: 'Đã khóa chấm điểm',
            status: 403,
          },
        };
      }

      const { data: upsertData, error: upsertErr } = await supabase
        .from('votes')
        .upsert(
          {
            participant_id: currentPartId,
            team_id: teamId,
            vocal_score: vocalScore,
            performance_score: performanceScore,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'participant_id,team_id' }
        )
        .select('id')
        .maybeSingle();

      if (!upsertErr) {
        return {
          success: true,
          voteId: upsertData?.id,
        };
      }
    }

    if (errorMsg.includes('ERR_INACTIVE_PARTICIPANT') || errorMsg.includes('vô hiệu hóa')) {
      return {
        success: false,
        error: {
          code: 'ERR_INACTIVE_PARTICIPANT',
          message: 'Tài khoản đã bị vô hiệu hóa',
          status: 403,
        },
      };
    }

    if (errorMsg.includes('ERR_TEAM_NO_VIDEO') || errorMsg.includes('chưa có video')) {
      return {
        success: false,
        error: {
          code: 'ERR_TEAM_NO_VIDEO',
          message: 'Đội thi chưa có video hợp lệ',
          status: 400,
        },
      };
    }

    return {
      success: false,
      error: {
        code: error.code || 'ERR_SUBMIT_VOTE_FAILED',
        message: error.message || 'Lỗi gửi phiếu chấm điểm',
        status: 400,
      },
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('ERR_VOTING_LOCKED') || msg.includes('Đã khóa chấm điểm')) {
      return {
        success: false,
        error: {
          code: 'ERR_VOTING_LOCKED',
          message: 'Đã khóa chấm điểm',
          status: 403,
        },
      };
    }
    return {
      success: false,
      error: {
        code: 'ERR_NETWORK_ERROR',
        message: msg,
        status: 500,
      },
    };
  }
}

/**
 * Admin RPC to atomically lock the voting system.
 */
export async function lockVotingSystem(): Promise<{ success: boolean; error?: string }> {
  if (isMockMode) {
    const res = await mockStore.lockSystem();
    return { success: res };
  }

  try {
    const { data, error } = await supabase.rpc('lock_voting_system');
    if (!error) {
      return { success: Boolean(data) };
    }
  } catch {
    // fallback to direct table update
  }

  // Direct fallback
  const { error } = await supabase
    .from('system_settings')
    .update({ is_locked: true, locked_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Admin RPC to emergency unlock the voting system.
 */
export async function emergencyUnlockSystem(reason: string): Promise<{ success: boolean; error?: string }> {
  if (isMockMode) {
    const res = await mockStore.unlockSystem(reason);
    return { success: res };
  }

  try {
    const { data, error } = await supabase.rpc('emergency_unlock_system', {
      p_reason: reason,
    });
    if (!error) {
      return { success: Boolean(data) };
    }
  } catch {
    // fallback
  }

  // Direct fallback
  const { error } = await supabase
    .from('system_settings')
    .update({ is_locked: false, unlock_reason: reason })
    .eq('id', 1);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
