import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TeamBoardItem } from '../types';
import { supabase, isMockMode, getYouTubeEmbedUrl } from '../lib/supabase';
import { mockStore } from '../lib/mockData';
import { X, Upload, Trash2, Video, AlertCircle, CheckCircle, Link2, Film, Edit3, Users, ChevronDown, ChevronUp } from 'lucide-react';

interface VoterEntry {
  vote_id: string;
  participant_id: string;
  participant_name: string;
  department: string;
  vocal_score: number;
  performance_score: number;
  voted_at: string;
}

interface TeamDetailModalProps {
  team: TeamBoardItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export const TeamDetailModal: React.FC<TeamDetailModalProps> = ({
  team,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [teamName, setTeamName] = useState(team?.name ?? '');
  const [teamOrder, setTeamOrder] = useState<number>(team?.performance_order ?? 1);

  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(team?.video_url ?? null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');

  const [teammateBonus, setTeammateBonus] = useState<number>(team?.teammate_bonus ?? 0);
  const [luckyStar, setLuckyStar] = useState<number>(team?.lucky_star ?? 0);

  // ── Voter list state ────────────────────────────────────────────────────────
  const [voters, setVoters] = useState<VoterEntry[]>([]);
  const [votersLoading, setVotersLoading] = useState(false);
  const [votersOpen, setVotersOpen] = useState(false);
  const [deletingVoteId, setDeletingVoteId] = useState<string | null>(null);
  // ───────────────────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (team) {
      setTeamName(team.name);
      setTeamOrder(team.performance_order);
      setCurrentVideoUrl(team.video_url);
      setCustomUrlInput(team.video_url || '');
      setTeammateBonus(team.teammate_bonus);
      setLuckyStar(team.lucky_star);
      setErrorMessage(null);
      setSuccessMessage(null);
      setShowUrlInput(false);
      // Reset voter list when team changes
      setVoters([]);
      setVotersOpen(false);
    }
  }, [team]);

  // Load voter list for this team
  const loadVoters = useCallback(async () => {
    if (!team) return;
    setVotersLoading(true);
    try {
      if (isMockMode) {
        setVoters([]);
        return;
      }
      // Fetch votes for this team
      const { data: votesData, error: votesErr } = await supabase
        .from('votes')
        .select('id, participant_id, vocal_score, performance_score, updated_at, created_at')
        .eq('team_id', team.id)
        .order('updated_at', { ascending: false });

      if (votesErr) throw votesErr;
      if (!votesData || votesData.length === 0) {
        setVoters([]);
        return;
      }

      // Fetch participant details
      const participantIds = votesData.map((v: any) => v.participant_id);
      const { data: partsData } = await supabase
        .from('participants')
        .select('id, name, username, department')
        .in('id', participantIds);

      const partsMap: Record<string, { name: string; department: string }> = {};
      for (const p of partsData ?? []) {
        partsMap[p.id] = {
          name: p.name || p.username || p.id,
          department: p.department || '',
        };
      }

      const entries: VoterEntry[] = votesData.map((v: any) => {
        const p = partsMap[v.participant_id] ?? { name: v.participant_id, department: '' };
        const ts = v.updated_at || v.created_at || '';
        return {
          vote_id: v.id,
          participant_id: v.participant_id,
          participant_name: p.name,
          department: p.department,
          vocal_score: v.vocal_score,
          performance_score: v.performance_score,
          voted_at: ts
            ? new Date(ts).toLocaleString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })
            : '—',
        };
      });

      setVoters(entries);
    } catch (err: any) {
      console.error('loadVoters error:', err);
    } finally {
      setVotersLoading(false);
    }
  }, [team]);

  // Auto-load voters when section is opened
  useEffect(() => {
    if (votersOpen) loadVoters();
  }, [votersOpen, loadVoters]);

  // Delete a single vote
  const handleDeleteVote = async (voter: VoterEntry) => {
    if (!confirm(`Xóa phiếu chấm của "${voter.participant_name}" cho tiết mục này?`)) return;
    setDeletingVoteId(voter.vote_id);
    try {
      if (isMockMode) {
        setVoters((prev) => prev.filter((v) => v.vote_id !== voter.vote_id));
        onUpdated();
        return;
      }
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('id', voter.vote_id);
      if (error) throw error;
      setVoters((prev) => prev.filter((v) => v.vote_id !== voter.vote_id));
      onUpdated();
      setSuccessMessage(`Đã xóa phiếu chấm của "${voter.participant_name}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage('Xóa phiếu thất bại: ' + (err.message || String(err)));
    } finally {
      setDeletingVoteId(null);
    }
  };

  if (!isOpen || !team) return null;

  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setErrorMessage('Chỉ chấp nhận file video (MP4, WebM)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setErrorMessage('Kích thước tối đa 100MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploading(true);

    try {
      if (isMockMode) {
        const uploadResult = await mockStore.uploadVideoFile(team.id, file);
        if (uploadResult && uploadResult.success && uploadResult.video_url) {
          setCurrentVideoUrl(uploadResult.video_url);
          setSuccessMessage('Đã lưu video lên máy chủ (tất cả điện thoại đều xem được ngay)');
          onUpdated();
        } else {
          setErrorMessage(uploadResult?.error || 'Lỗi khi tải video lên máy chủ');
        }
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Supabase Storage 6-step transactional protocol
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `teams/${team.id}/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from('team-videos')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from('team-videos')
        .getPublicUrl(storagePath);

      const newVideoUrl = publicUrlData.publicUrl;
      const oldStoragePath = team.video_storage_path;

      let cleanupJobId: string | null = null;
      if (oldStoragePath) {
        const { data: jobData } = await supabase
          .from('storage_cleanup_jobs')
          .insert({ bucket_id: 'team-videos', file_path: oldStoragePath, status: 'pending' })
          .select('id')
          .single();
        cleanupJobId = jobData?.id ?? null;
      }

      let { error: dbError } = await supabase
        .from('teams')
        .update({ video_url: newVideoUrl, video_storage_path: storagePath, updated_at: new Date().toISOString() })
        .eq('id', team.id);

      if (dbError && dbError.message.includes('video_storage_path')) {
        const fallbackRes = await supabase
          .from('teams')
          .update({ video_url: newVideoUrl, updated_at: new Date().toISOString() })
          .eq('id', team.id);
        dbError = fallbackRes.error;
      }

      if (dbError) {
        await supabase.storage.from('team-videos').remove([storagePath]);
        throw dbError;
      }

      if (oldStoragePath) {
        const { error: removeError } = await supabase.storage.from('team-videos').remove([oldStoragePath]);
        if (cleanupJobId) {
          await supabase
            .from('storage_cleanup_jobs')
            .update({ status: removeError ? 'failed' : 'completed', error_message: removeError?.message ?? null })
            .eq('id', cleanupJobId);
        }
      }

      setCurrentVideoUrl(newVideoUrl);
      setSuccessMessage('Đã cập nhật video mới');
      onUpdated();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Bucket') || msg.includes('bucket') || msg.includes('not found')) {
        setErrorMessage('Chưa tạo bucket "team-videos" trên Supabase. Anh/chị hãy bấm "Dán link URL" phía trên để dán trực tiếp link video (YouTube/MP4) rất nhanh và tiện!');
        setShowUrlInput(true);
      } else {
        setErrorMessage(msg || 'Lỗi khi upload video');
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveCustomUrl = async (urlToSave: string) => {
    const cleanUrl = urlToSave.trim();
    if (!cleanUrl) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (isMockMode) {
        await mockStore.updateTeamVideo(team.id, cleanUrl);
        setCurrentVideoUrl(cleanUrl);
        setIsSaving(false);
        setSuccessMessage('Đã cập nhật link video mới');
        setShowUrlInput(false);
        onUpdated();
        return;
      }

      const { error: dbError } = await supabase
        .from('teams')
        .update({ video_url: cleanUrl, updated_at: new Date().toISOString() })
        .eq('id', team.id);

      if (dbError) throw dbError;

      setCurrentVideoUrl(cleanUrl);
      setSuccessMessage('Đã cập nhật link video mới');
      setShowUrlInput(false);
      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi cập nhật link video');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!currentVideoUrl && !team.video_storage_path) return;

    if (!confirm('Xóa video của đội này? Người tham gia sẽ không thể chấm điểm nếu thiếu video.')) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isMockMode) {
      await mockStore.updateTeamVideo(team.id, null);
      setCurrentVideoUrl(null);
      setIsSaving(false);
      setSuccessMessage('Đã xóa video');
      onUpdated();
      return;
    }

    try {
      const oldStoragePath = team.video_storage_path;
      let { error: dbError } = await supabase
        .from('teams')
        .update({ video_url: null, video_storage_path: null, updated_at: new Date().toISOString() })
        .eq('id', team.id);

      if (dbError && dbError.message.includes('video_storage_path')) {
        const fallbackRes = await supabase
          .from('teams')
          .update({ video_url: null, updated_at: new Date().toISOString() })
          .eq('id', team.id);
        dbError = fallbackRes.error;
      }

      if (dbError) throw dbError;

      if (oldStoragePath) {
        await supabase.storage.from('team-videos').remove([oldStoragePath]);
      }

      setCurrentVideoUrl(null);
      setSuccessMessage('Đã xóa video');
      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa video');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTeamInfo = async () => {
    const cleanName = teamName.trim();
    if (!cleanName) {
      setErrorMessage('Tên đội thi không được để trống');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isMockMode) {
      await mockStore.updateTeam(team.id, {
        name: cleanName,
        performance_order: Number(teamOrder),
        teammate_bonus: teammateBonus,
        lucky_star: luckyStar,
      });
      setIsSaving(false);
      setSuccessMessage('Đã lưu thông tin đội thi thành công');
      onUpdated();
      return;
    }

    try {
      const { error } = await supabase
        .from('teams')
        .update({
          name: cleanName,
          performance_order: Number(teamOrder),
          display_order: Number(teamOrder),
          teammate_bonus: teammateBonus,
          lucky_star: luckyStar,
          updated_at: new Date().toISOString(),
        })
        .eq('id', team.id);

      if (error) throw error;

      setSuccessMessage('Đã lưu thông tin đội thi thành công');
      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi lưu thông tin');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (
      !confirm(
        `Xác nhận xóa hoàn toàn đội thi "${team.name}"? Thao tác này sẽ xóa đội thi và toàn bộ phiếu đã chấm của đội này.`
      )
    ) {
      return;
    }

    setIsSaving(true);
    if (isMockMode) {
      await mockStore.deleteTeam(team.id);
      setIsSaving(false);
      onUpdated();
      onClose();
      return;
    }

    try {
      const { error } = await supabase.from('teams').delete().eq('id', team.id);
      if (error) throw error;
      onUpdated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa đội thi');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <div className="bg-white border border-slate-300 rounded shadow-2xl w-full max-w-md overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-700">#{team.performance_order}.</span>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{team.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 space-y-3 font-sans overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 1. Tên Đội Thi & Thứ Tự Biểu Diễn */}
          <div className="space-y-1.5 pb-2.5 border-b border-slate-200">
            <label className="block text-[11px] font-mono text-slate-600 font-semibold uppercase tracking-wider">
              1. Tên Đội Thi & Thứ Tự Biểu Diễn
            </label>
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-1">
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">STT</label>
                <input
                  type="number"
                  min={1}
                  value={teamOrder}
                  onChange={(e) => setTeamOrder(Math.max(1, parseInt(e.target.value) || 1))}
                  className="oat-input text-xs font-mono font-bold text-center"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[10px] font-mono text-slate-500 mb-0.5">Tên Đội / Tiết Mục</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Khoa/Phòng - Tên bài hát..."
                  className="oat-input text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          {/* 2. Video Trình Diễn */}
          <div className="space-y-2 pb-2.5 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-slate-600 font-semibold uppercase tracking-wider">
                2. Video Trình Diễn
              </label>
              <button
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
                className="text-[11px] font-mono text-slate-500 hover:text-slate-800 underline flex items-center gap-1"
              >
                <Link2 className="w-3 h-3" />
                <span>{showUrlInput ? 'Ẩn dán link' : 'Dán link URL'}</span>
              </button>
            </div>

            {/* Custom URL Input Box */}
            {showUrlInput && (
              <div className="p-2 rounded bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-xs">
                <span className="text-[11px] text-slate-600 block">Nhập đường dẫn trực tiếp (URL MP4 hoặc video cục bộ):</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://.../video.mp4 hoặc /videos/sample.mp4"
                    className="oat-input text-xs flex-1 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveCustomUrl(customUrlInput)}
                    disabled={isSaving || !customUrlInput.trim()}
                    className="oat-btn oat-btn-primary text-xs px-2.5"
                  >
                    Lưu
                  </button>
                </div>
                <div className="flex gap-2 text-[10px] text-slate-500 pt-0.5">
                  <span>Gợi ý:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomUrlInput('/videos/sample.mp4');
                      handleSaveCustomUrl('/videos/sample.mp4');
                    }}
                    className="text-amber-700 hover:underline"
                  >
                    Dùng video mẫu (/videos/sample.mp4)
                  </button>
                </div>
              </div>
            )}

            {currentVideoUrl ? (
              <div className="space-y-2">
                <div className="rounded border border-slate-200 bg-slate-900 aspect-video flex items-center justify-center overflow-hidden">
                  {getYouTubeEmbedUrl(currentVideoUrl) ? (
                    <iframe
                      src={getYouTubeEmbedUrl(currentVideoUrl)!}
                      title="YouTube Video Player"
                      className="w-full h-full aspect-video border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      key={currentVideoUrl}
                      src={currentVideoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 oat-btn text-xs font-mono py-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Đang tải...' : 'Thay Video Mới'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteVideo}
                    disabled={isSaving || isUploading}
                    className="oat-btn oat-btn-danger text-xs font-mono py-1.5 px-3"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 border border-dashed border-slate-300 rounded bg-slate-50 text-center font-mono text-xs space-y-2">
                <Video className="w-5 h-5 text-slate-400 mx-auto" />
                <p className="text-slate-500">Chưa có video trình diễn</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="oat-btn oat-btn-primary text-xs font-mono py-1 px-3"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Đang tải...' : 'Tải Video Lên'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveCustomUrl('/videos/sample.mp4')}
                    className="oat-btn text-xs font-mono py-1 px-2.5 text-slate-700"
                  >
                    <Film className="w-3.5 h-3.5 text-amber-600" />
                    <span>Mẫu</span>
                  </button>
                </div>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              disabled={isUploading}
              onChange={handleVideoUpload}
              className="hidden"
            />
          </div>

          {/* 3. Điểm Đồng Đội & Ngôi Sao */}
          <div className="space-y-2.5">
            <label className="block text-[11px] font-mono text-slate-600 font-semibold uppercase tracking-wider">
              3. Điểm Đồng Đội & Ngôi Sao
            </label>

            {/* Teammate Bonus */}
            <div>
              <span className="block text-xs font-mono text-slate-600 mb-1">
                Điểm đồng đội (0 hoặc 3):
              </span>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setTeammateBonus(0)}
                  className={`py-1 px-2 rounded border transition-colors ${
                    teammateBonus === 0
                      ? 'bg-slate-900 text-white font-bold border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  0 điểm
                </button>
                <button
                  type="button"
                  onClick={() => setTeammateBonus(3)}
                  className={`py-1 px-2 rounded border transition-colors ${
                    teammateBonus === 3
                      ? 'bg-slate-900 text-white font-bold border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  +3 điểm
                </button>
              </div>
            </div>

            {/* Lucky Star */}
            <div>
              <span className="block text-xs font-mono text-slate-600 mb-1">
                Ngôi sao may mắn (-5, 0, +5):
              </span>
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setLuckyStar(-5)}
                  className={`py-1 px-2 rounded border transition-colors ${
                    luckyStar === -5
                      ? 'bg-rose-100 text-rose-800 font-bold border-rose-400'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => setLuckyStar(0)}
                  className={`py-1 px-2 rounded border transition-colors ${
                    luckyStar === 0
                      ? 'bg-slate-900 text-white font-bold border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setLuckyStar(5)}
                  className={`py-1 px-2 rounded border transition-colors ${
                    luckyStar === 5
                      ? 'bg-emerald-100 text-emerald-800 font-bold border-emerald-400'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  +5
                </button>
              </div>
            </div>
          </div>

          {/* 4. Danh sách khán giả đã chấm điểm */}
          <div className="space-y-1.5 pb-2.5 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setVotersOpen((prev) => !prev)}
              className="w-full flex items-center justify-between text-[11px] font-mono text-slate-600 font-semibold uppercase tracking-wider hover:text-slate-900 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                4. Khán Giả Đã Chấm Điểm
                {voters.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                    {voters.length}
                  </span>
                )}
              </span>
              {votersOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {votersOpen && (
              <div className="mt-1.5 space-y-1">
                {votersLoading ? (
                  <p className="text-center text-xs font-mono text-slate-400 py-3">Đang tải...</p>
                ) : voters.length === 0 ? (
                  <p className="text-center text-xs font-mono text-slate-400 py-3">
                    Chưa có khán giả nào chấm điểm tiết mục này.
                  </p>
                ) : (
                  <div className="rounded border border-slate-200 overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[10px] text-slate-600 uppercase">
                          <th className="py-1.5 px-2 font-semibold">Khán Giả</th>
                          <th className="py-1.5 px-1 text-center font-semibold w-10">Hát</th>
                          <th className="py-1.5 px-1 text-center font-semibold w-10">KĐ</th>
                          <th className="py-1.5 px-1 text-center font-semibold w-16">Thời Gian</th>
                          <th className="py-1.5 px-1 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {voters.map((voter) => (
                          <tr
                            key={voter.vote_id}
                            className={`hover:bg-rose-50 transition-colors ${
                              deletingVoteId === voter.vote_id ? 'opacity-40' : ''
                            }`}
                          >
                            <td className="py-1.5 px-2">
                              <div className="font-semibold text-slate-900 truncate max-w-[130px]">
                                {voter.participant_name}
                              </div>
                              {voter.department && (
                                <div className="text-[9px] text-slate-400 truncate max-w-[130px]">
                                  {voter.department}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-1 text-center font-mono font-bold text-slate-800">
                              {voter.vocal_score}
                            </td>
                            <td className="py-1.5 px-1 text-center font-mono font-bold text-slate-800">
                              {voter.performance_score}
                            </td>
                            <td className="py-1.5 px-1 text-center font-mono text-[9px] text-slate-400 leading-tight">
                              {voter.voted_at}
                            </td>
                            <td className="py-1.5 px-1 text-center">
                              <button
                                type="button"
                                disabled={deletingVoteId === voter.vote_id}
                                onClick={() => handleDeleteVote(voter)}
                                title={`Xóa phiếu chấm của ${voter.participant_name}`}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-30"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={loadVoters}
                    disabled={votersLoading}
                    className="text-[10px] font-mono text-slate-400 hover:text-slate-700 hover:underline"
                  >
                    ↻ Làm mới danh sách
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={handleSaveTeamInfo}
              disabled={isSaving}
              className="w-full oat-btn oat-btn-primary py-2 text-xs font-mono font-bold flex items-center justify-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi Thông Tin Đội'}</span>
            </button>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleDeleteTeam}
                disabled={isSaving}
                className="text-[11px] font-mono text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa đội thi này khỏi hội thi</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
