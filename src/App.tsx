import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { AdminDashboard } from './components/AdminDashboard';
import { ParticipantView } from './components/ParticipantView';
import { LoginModal } from './components/LoginModal';
import { supabase, isMockMode } from './lib/supabase';
import { mockStore } from './lib/mockData';
import { TeamBoardItem, SystemSettings } from './types';
import { Lock, LogIn, Star, Video } from 'lucide-react';

export const App: React.FC = () => {
  const { role, isLoading } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Guest view states
  const [teams, setTeams] = useState<TeamBoardItem[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const fetchPublicBoard = async () => {
    if (isMockMode) {
      setSettings(mockStore.getSettings());
      setTeams(mockStore.getTeams());
      return;
    }

    const { data: setts } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (setts) setSettings(setts as SystemSettings);

    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .order('performance_order', { ascending: true })
      .order('name', { ascending: true })
      .order('id', { ascending: true });

    const { data: votesData } = await supabase.from('votes').select('team_id, vocal_score, performance_score');

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
        };
      });
      setTeams(mapped);
    }
  };

  useEffect(() => {
    if (role === 'guest') {
      fetchPublicBoard();

      if (isMockMode) {
        const unsubscribe = mockStore.subscribe(() => {
          fetchPublicBoard();
        });
        return () => unsubscribe();
      }
    }
  }, [role]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin mb-2" />
        <span>loading...</span>
      </div>
    );
  }

  if (role === 'admin') {
    return <AdminDashboard />;
  }

  if (role === 'participant') {
    return <ParticipantView />;
  }

  // Light Mode Guest Landing View - Optimized for Mobile FullHD
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Compact Top Navbar */}
      <header className="border-b border-slate-200 bg-white px-3 sm:px-4 py-2 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
            HỘI THI
          </span>
          <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 truncate">
            Bình Chọn & Chấm Điểm
          </h1>
        </div>

        <button
          onClick={() => setIsLoginModalOpen(true)}
          className="oat-btn oat-btn-primary py-1 px-2.5 text-xs font-medium"
        >
          <LogIn className="w-3 h-3" />
          <span>Đăng nhập</span>
        </button>
      </header>

      {/* Locked Alert if locked */}
      {settings?.is_locked && (
        <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 text-rose-700 text-xs font-mono flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
          <span>Hệ thống đã khóa chấm điểm. Các phiếu mới không được tiếp nhận.</span>
        </div>
      )}

      {/* Main Content - Tight Margins, Maximize Board Space */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-2 sm:p-4 space-y-2">
        {/* Compact Bar */}
        <div className="bg-white border border-slate-200 rounded p-2 sm:p-2.5 flex items-center justify-between">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">Bảng Điểm Trực Tiếp</h2>
            <p className="text-[11px] text-slate-500 font-mono">Chạm vào đội thi để đăng nhập và chấm điểm</p>
          </div>
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="oat-btn text-xs font-mono"
          >
            Chấm điểm →
          </button>
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
                      Chưa có dữ liệu đội thi.
                    </td>
                  </tr>
                ) : (
                  teams.map((team) => (
                    <tr
                      key={team.id}
                      onClick={() => setIsLoginModalOpen(true)}
                      className="hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {/* Column 1: Team Name (50% Width, Combined #order. Name) */}
                      <td style={{ width: '50%' }} className="py-2.5 px-2.5 sm:px-3 align-middle">
                        <div className="leading-tight">
                          <span className="font-semibold text-slate-900 text-xs sm:text-sm">
                            #{team.performance_order}. {team.name}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-mono">
                            {team.video_url ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700 font-medium">
                                <Video className="w-2.5 h-2.5" /> video
                              </span>
                            ) : (
                              <span className="text-slate-400">no video</span>
                            )}
                            <span>•</span>
                            <span>{team.vote_count} lượt</span>
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

      {/* Login Modal */}
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </div>
  );
};
