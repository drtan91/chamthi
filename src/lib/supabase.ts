import { createClient } from '@supabase/supabase-js';
import { mockStore } from './mockData';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dummy-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-anon-key';

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
  if (isMockMode) {
    // In mock mode, resolve participant ID from localStorage or mock session
    const currentPartId = participantId || localStorage.getItem('mock_participant_id') || 'p-1';
    return mockStore.submitVote(currentPartId, teamId, vocalScore, performanceScore);
  }

  try {
    const { data, error } = await supabase.rpc('submit_vote', {
      p_team_id: teamId,
      p_vocal_score: vocalScore,
      p_performance_score: performanceScore,
    });

    if (error) {
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
    }

    return {
      success: true,
      voteId: data,
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

  const { data, error } = await supabase.rpc('lock_voting_system');
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: Boolean(data) };
}

/**
 * Admin RPC to emergency unlock the voting system.
 */
export async function emergencyUnlockSystem(reason: string): Promise<{ success: boolean; error?: string }> {
  if (isMockMode) {
    const res = await mockStore.unlockSystem(reason);
    return { success: res };
  }

  const { data, error } = await supabase.rpc('emergency_unlock_system', {
    p_reason: reason,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: Boolean(data) };
}
