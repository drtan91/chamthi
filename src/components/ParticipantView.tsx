import React, { useState, useEffect, useCallback } from 'react';
import { TeamBoardItem, SystemSettings } from '../types';
import { supabase, isMockMode } from '../lib/supabase';
import { mockStore } from '../lib/mockData';
import { useAuth } from '../context/AuthContext';
import { VotingModal } from './VotingModal';
import {
  Video,
  Star,
  CheckCircle,
  Lock,
  LogOut,
  RefreshCw,
  User,
} from 'lucide-react';

export const ParticipantView: React.FC = () => {
  const { participant, logout } = useAuth();

  const [teams, setTeams] = useState<TeamBoardItem[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isVotingModalOpen, setIsVotingModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const selectedTeam = React.useMemo(
    () => teams.find((item) => item.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  // Load teams and my votes
  const loadData = useCallback(async () => {
    try {
      if (isMockMode) {
        setSettings(mockStore.getSettings());
        const mockTeams = mockStore.getTeams(participant?.id);
        setTeams(mockTeams);
        setIsLoading(false);
        return;
      }

      // 1. Fetch system settings
      const { data: setts } = await supabase
        .from('system_settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (setts) setSettings(setts as SystemSettings);

      // 2. Fetch teams
      let teamsData: any[] | null = null;
      const { data: res1, error: err1 } = await supabase
        .from('teams')
        .select('*')
        .order('performance_order', { ascending: true })
        .order('name', { ascending: true });

      if (!err1 && res1 && res1.length > 0) {
        teamsData = res1;
      } else {
        const { data: res2 } = await supabase.from('teams').select('*');
        if (res2 && res2.length > 0) {
          teamsData = res2;
        }
      }

      if (!teamsData || teamsData.length === 0) {
        setTeams(mockStore.getTeams(participant?.id));
        setIsLoading(false);
        return;
      }

      // 3. Fetch votes
      const { data: votesData } = await supabase
        .from('votes')
        .select('team_id, participant_id, vocal_score, performance_score');

      if (teamsData) {
        const mapped: TeamBoardItem[] = teamsData.map((t) => {
          const teamVotes = (votesData || []).filter((v) => v.team_id === t.id);
          const count = teamVotes.length;
          const avg =
            count > 0
              ? Number(
                  (
                    teamVotes.reduce((sum, v) => sum + (v.vocal_score + v.performance_score) / 2, 0) /
                    count
                  ).toFixed(2)
                )
              : 0;

          const myVote = participant
            ? teamVotes.find((v) => v.participant_id === participant.id)
            : undefined;

          return {
            id: t.id,
            name: t.name,
            performance_order: t.performance_order,
            video_url: t.video_url,
            video_storage_path: t.video_storage_path,
            audience_score: avg,
            vote_count: count,
            teammate_bonus: t.teammate_bonus,
            lucky_star: t.lucky_star,
            has_voted: Boolean(myVote),
            my_vocal_score: myVote?.vocal_score ?? null,
            my_performance_score: myVote?.performance_score ?? null,
          };
        });

        setTeams(mapped);
      }
    } catch (err) {
      console.error('Error loading participant data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [participant?.id]);

  useEffect(() => {
    loadData();

    if (isMockMode) {
      const unsubscribe = mockStore.subscribe(() => {
        loadData();
      });
      return () => unsubscribe();
    }

    const channel = supabase
      .channel('participant-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          if (payload.new) setSettings(payload.new as SystemSettings);
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const isLocked = settings?.is_locked ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Participant Compact Header */}
      <header className="border-b border-slate-200 bg-white px-3 sm:px-4 py-2 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
            CHẤM ĐIỂM
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-800">
            <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span className="font-bold text-slate-900 truncate max-w-[140px] sm:max-w-none">{participant?.name || 'Khán giả'}</span>
            {participant?.department && (
              <span className="text-slate-500 text-[11px] font-mono hidden xs:inline truncate max-w-[180px]">({participant.department})</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => loadData()}
            className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => logout()}
            className="oat-btn text-xs py-0.5 px-2 font-mono text-slate-600 hover:text-rose-600"
          >
            <LogOut className="w-3 h-3" />
            <span>Thoát</span>
          </button>
        </div>
      </header>

      {/* Locked Banner */}
      {isLocked && (
        <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 text-rose-700 text-xs font-mono flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
          <span>Hệ thống đã khóa chấm điểm. Các phiếu mới không được tiếp nhận.</span>
        </div>
      )}

      {/* Main Content - Tight Margins for Mobile FullHD */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-2 sm:p-4 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
          <span>Chạm vào đội thi để xem video & chấm điểm</span>
          <span>{teams.length} đội</span>
        </div>

        {/* 4-Column Table - 50% Team Name, Combined #{order}. Name, Large Score Numbers */}
        <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 font-mono text-[11px] text-slate-700 uppercase tracking-wider">
                  <th style={{ width: '50%' }} className="py-2 px-2.5 sm:px-3 font-semibold">
                    Đội Thi
                  </th>
                  <th style={{ width: '16.66%' }} className="py-2 px-1 text-center font-semibold">
                    Khán Giả
                  </th>
                  <th style={{ width: '16.66%' }} className="py-2 px-1 text-center font-semibold">
                    Đồng Đội
                  </th>
                  <th style={{ width: '16.66%' }} className="py-2 px-1 text-center font-semibold">
                    Ngôi Sao
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {teams.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400 font-mono">
                      {isLoading ? 'Đang tải dữ liệu...' : 'Chưa có đội thi nào.'}
                    </td>
                  </tr>
                ) : (
                  teams.map((team) => (
                    <tr
                      key={team.id}
                      onClick={() => {
                        setSelectedTeamId(team.id);
                        setIsVotingModalOpen(true);
                      }}
                      className="hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {/* Column 1: Team Name (50% Width, Combined #{order}. Name) */}
                      <td style={{ width: '50%' }} className="py-2.5 px-2.5 sm:px-3 align-middle">
                        <div className="leading-tight">
                          <span className="font-semibold text-slate-900 text-xs sm:text-sm">
                            #{team.performance_order}. {team.name}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono">
                            {team.has_voted ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700 font-semibold">
                                <CheckCircle className="w-2.5 h-2.5" />
                                Đã chấm ({((team.my_vocal_score || 0) + (team.my_performance_score || 0)) / 2}đ)
                              </span>
                            ) : team.video_url ? (
                              <span className="text-slate-500 flex items-center gap-0.5">
                                <Video className="w-2.5 h-2.5" />
                                Chấm điểm →
                              </span>
                            ) : (
                              <span className="text-slate-400">chưa có video</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Audience Score (Large Font) */}
                      <td style={{ width: '16.66%' }} className="py-2.5 px-1 text-center font-mono align-middle">
                        <span className="text-sm sm:text-base font-bold text-slate-900">
                          {team.audience_score > 0 ? team.audience_score.toFixed(1) : '—'}
                        </span>
                      </td>

                      {/* Column 3: Teammate Bonus (Large Font) */}
                      <td style={{ width: '16.66%' }} className="py-2.5 px-1 text-center font-mono align-middle">
                        {team.teammate_bonus > 0 ? (
                          <span className="text-xs sm:text-sm font-bold text-emerald-700">
                            +{team.teammate_bonus}
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-normal text-slate-400">0</span>
                        )}
                      </td>

                      {/* Column 4: Lucky Star (Large Font) */}
                      <td style={{ width: '16.66%' }} className="py-2.5 px-1 text-center font-mono align-middle">
                        {team.lucky_star > 0 ? (
                          <span className="inline-flex items-center text-xs sm:text-sm font-bold text-amber-700">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500 mr-0.5 inline" />
                            +{team.lucky_star}
                          </span>
                        ) : team.lucky_star < 0 ? (
                          <span className="inline-flex items-center text-xs sm:text-sm font-bold text-rose-700">
                            <Star className="w-3 h-3 fill-rose-500 text-rose-500 mr-0.5 inline" />
                            {team.lucky_star}
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-normal text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Voting Modal */}
      <VotingModal
        team={selectedTeam}
        isOpen={isVotingModalOpen}
        onClose={() => setIsVotingModalOpen(false)}
        onVoteSuccess={() => loadData()}
        isSystemLocked={isLocked}
      />
    </div>
  );
};
