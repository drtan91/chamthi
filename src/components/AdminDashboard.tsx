import React, { useState, useEffect, useCallback } from 'react';
import { TeamBoardItem, SystemSettings, Participant } from '../types';
import { supabase, lockVotingSystem, emergencyUnlockSystem, isMockMode } from '../lib/supabase';
import { mockStore } from '../lib/mockData';
import { useAuth } from '../context/AuthContext';
import { TeamDetailModal } from './TeamDetailModal';
import { ExcelImportModal } from './ExcelImportModal';
import { AddTeamModal } from './AddTeamModal';
import {
  Lock,
  Unlock,
  FileSpreadsheet,
  LogOut,
  RefreshCw,
  Video,
  Star,
  AlertTriangle,
  UserX,
  Plus,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { logout } = useAuth();

  const [teams, setTeams] = useState<TeamBoardItem[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeTab, setActiveTab] = useState<'board' | 'participants'>('board');

  const [isLoading, setIsLoading] = useState(true);
  const [isLocking, setIsLocking] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);

  const selectedTeam = React.useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');

  // Fetch all board data
  const loadData = useCallback(async () => {
    try {
      if (isMockMode) {
        setSettings(mockStore.getSettings());
        setTeams(mockStore.getTeams());
        setParticipants(mockStore.getParticipants());
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

      // 2. Fetch team board via RPC or direct join
      const { data: boardData, error: boardError } = await supabase.rpc('get_team_board');

      if (!boardError && boardData) {
        setTeams(boardData);
      } else {
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
      }

      // 3. Fetch participants list for management tab
      const { data: partData } = await supabase
        .from('view_participants_public')
        .select('*')
        .order('created_at', { ascending: true });

      if (partData) setParticipants(partData as Participant[]);
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    if (isMockMode) {
      const unsubscribe = mockStore.subscribe(() => {
        loadData();
      });
      return () => unsubscribe();
    }

    const channel = supabase
      .channel('admin-realtime')
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

  // Handle Lock
  const handleConfirmLock = async () => {
    setIsLocking(true);
    const res = await lockVotingSystem();
    setIsLocking(false);
    setShowLockConfirm(false);
    if (res.success) {
      loadData();
    } else {
      alert('Khóa hệ thống thất bại: ' + res.error);
    }
  };

  // Handle Unlock
  const handleConfirmUnlock = async () => {
    if (!unlockReason.trim()) {
      alert('Vui lòng nhập lý do mở khóa khẩn cấp');
      return;
    }
    setIsLocking(true);
    const res = await emergencyUnlockSystem(unlockReason.trim());
    setIsLocking(false);
    setShowUnlockModal(false);
    setUnlockReason('');
    if (res.success) {
      loadData();
    } else {
      alert('Mở khóa thất bại: ' + res.error);
    }
  };

  // Deactivate participant
  const handleToggleParticipant = async (p: Participant) => {
    const actionText = p.is_active ? 'vô hiệu hóa' : 'kích hoạt lại';
    if (!confirm(`Bạn có chắc muốn ${actionText} tài khoản ${p.username}?`)) return;

    if (isMockMode) {
      mockStore.toggleParticipant(p.id);
      loadData();
      return;
    }

    const { error } = await supabase.rpc('deactivate_participant', {
      p_participant_id: p.id,
      p_deactivate: p.is_active,
    });

    if (error) {
      alert('Thao tác thất bại: ' + error.message);
    } else {
      loadData();
    }
  };

  // Deactivate all participants
  const handleDeactivateAll = async () => {
    if (!confirm('CẢNH BÁO: Bạn có chắc chắn muốn vô hiệu hóa TOÀN BỘ tài khoản người tham gia?')) return;

    if (isMockMode) {
      mockStore.deactivateAllParticipants();
      alert('Đã vô hiệu hóa toàn bộ người tham gia.');
      loadData();
      return;
    }

    const { error } = await supabase.rpc('deactivate_all_participants');
    if (error) {
      alert('Thất bại: ' + error.message);
    } else {
      alert('Đã vô hiệu hóa toàn bộ người tham gia.');
      loadData();
    }
  };

  const isLocked = settings?.is_locked ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Compact Top Navbar */}
      <header className="border-b border-slate-200 bg-white px-3 sm:px-4 py-2 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
            ADMIN
          </span>
          <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 truncate">
            Quản Trị Hội Thi
          </h1>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Lock status button */}
          {isLocked ? (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                <Lock className="w-3 h-3 text-rose-600" />
                ĐÃ KHÓA
              </span>
              <button
                onClick={() => setShowUnlockModal(true)}
                className="oat-btn text-xs py-0.5 px-1.5"
                title="Mở khóa khẩn cấp"
              >
                Mở
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLockConfirm(true)}
              className="oat-btn oat-btn-danger text-xs font-mono font-semibold py-1 px-2"
            >
              <Lock className="w-3 h-3" />
              <span>Khóa Chấm Điểm</span>
            </button>
          )}

          {/* Import Excel */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="oat-btn text-xs font-mono py-1 px-2"
          >
            <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
            <span className="hidden sm:inline">Import</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadData()}
            className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Reset Demo Data in Mock Mode */}
          {isMockMode && (
            <button
              onClick={() => {
                if (confirm('Khôi phục toàn bộ dữ liệu mẫu ban đầu?')) {
                  mockStore.resetToDefault();
                  window.location.reload();
                }
              }}
              className="px-1.5 py-0.5 text-[11px] font-mono text-slate-500 hover:text-rose-600 rounded border border-slate-200 hover:border-rose-300"
              title="Khôi phục dữ liệu mẫu ban đầu"
            >
              Reset
            </button>
          )}

          {/* Logout */}
          <button
            onClick={() => logout()}
            className="p-1 rounded hover:bg-rose-50 text-rose-600 transition-colors"
            title="Đăng xuất"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area - Optimized for Mobile FullHD */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-2 sm:p-4 space-y-2">
        {/* Minimal Tab Switcher */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 font-mono text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('board')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === 'board'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Bảng Điểm ({teams.length})
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeTab === 'participants'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Khán Giả ({participants.length})
            </button>
          </div>

          {activeTab === 'board' && (
            <button
              onClick={() => setIsAddTeamModalOpen(true)}
              className="oat-btn oat-btn-primary py-1 px-2.5 text-xs font-mono font-semibold flex items-center gap-1"
              title="Thêm đội thi mới"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Đội</span>
            </button>
          )}
        </div>

        {/* TAB 1: 4-COLUMN TABLE */}
        {activeTab === 'board' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
              <span>* Nhấp dòng để cấu hình video, điểm đồng đội, ngôi sao</span>
              <span>STT tăng dần</span>
            </div>

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
                            setIsTeamModalOpen(true);
                          }}
                          className="hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                        >
                          {/* Column 1: Team Name (50% Width, Combined #{order}. Name) */}
                          <td style={{ width: '50%' }} className="py-2.5 px-2.5 sm:px-3 align-middle">
                            <div className="leading-tight">
                              <span className="font-semibold text-slate-900 text-xs sm:text-sm hover:text-amber-700 transition-colors">
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
          </div>
        )}

        {/* TAB 2: PARTICIPANTS */}
        {activeTab === 'participants' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">
                Quản lý kích hoạt tài khoản ({participants.length} người)
              </span>
              <button
                onClick={handleDeactivateAll}
                className="oat-btn oat-btn-danger text-xs font-mono py-1 px-2"
              >
                <UserX className="w-3 h-3" />
                <span>Vô hiệu hóa toàn bộ</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 font-mono text-[11px] text-slate-700 uppercase tracking-wider sticky top-0">
                      <th className="py-2 px-3 font-semibold">STT</th>
                      <th className="py-2 px-3 font-semibold">Tên Nhân Viên</th>
                      <th className="py-2 px-3 font-semibold">Khoa / Phòng Ban</th>
                      <th className="py-2 px-3 text-center font-semibold">Trạng Thái</th>
                      <th className="py-2 px-3 text-center font-semibold">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {participants.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 font-mono">
                          Chưa có tài khoản. Hãy nhấn "Import".
                        </td>
                      </tr>
                    ) : (
                      participants.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 text-slate-900 font-semibold">{p.name || p.username}</td>
                          <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{p.department || '—'}</td>
                          <td className="py-2 px-3 text-center font-mono">
                            {p.is_active ? (
                              <span className="text-emerald-700 font-medium text-[11px]">active</span>
                            ) : (
                              <span className="text-rose-700 font-medium text-[11px]">disabled</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => handleToggleParticipant(p)}
                              className="oat-btn text-[11px] py-0.5 px-2"
                            >
                              {p.is_active ? 'Khóa' : 'Mở'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODALS */}
      <TeamDetailModal
        team={selectedTeam}
        isOpen={isTeamModalOpen}
        onClose={() => {
          setIsTeamModalOpen(false);
          setSelectedTeamId(null);
        }}
        onUpdated={() => loadData()}
      />

      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => loadData()}
      />

      <AddTeamModal
        isOpen={isAddTeamModalOpen}
        onClose={() => setIsAddTeamModalOpen(false)}
        onCreated={() => loadData()}
        nextOrder={teams.length + 1}
      />

      {/* Lock Confirmation Dialog */}
      {showLockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
          <div className="bg-white border border-rose-300 rounded p-4 max-w-sm w-full space-y-3 shadow-lg">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-sm font-bold text-slate-900">Xác Nhận Khóa Chấm Điểm</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Thao tác một chiều: Mọi yêu cầu gửi hoặc sửa phiếu mới sẽ lập tức bị từ chối với lỗi <strong className="font-mono text-slate-900">ERR_VOTING_LOCKED (403)</strong>.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowLockConfirm(false)}
                className="oat-btn text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isLocking}
                onClick={handleConfirmLock}
                className="oat-btn oat-btn-danger text-xs font-mono font-bold"
              >
                {isLocking ? 'Đang khóa...' : 'Xác Nhận Khóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Unlock Dialog */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
          <div className="bg-white border border-slate-300 rounded p-4 max-w-sm w-full space-y-3 shadow-lg">
            <div className="flex items-center gap-2 text-amber-700">
              <Unlock className="w-4 h-4" />
              <h3 className="text-sm font-bold text-slate-900">Mở Khóa Khẩn Cấp</h3>
            </div>
            <div>
              <label className="block text-xs font-mono text-slate-600 mb-1">
                Lý do mở khóa (bắt buộc):
              </label>
              <textarea
                rows={2}
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="Nhập lý do..."
                className="oat-input text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowUnlockModal(false)}
                className="oat-btn text-xs"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={isLocking}
                onClick={handleConfirmUnlock}
                className="oat-btn oat-btn-primary text-xs font-mono"
              >
                {isLocking ? 'Đang mở...' : 'Mở Khóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
