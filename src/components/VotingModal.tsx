import React, { useState, useEffect } from 'react';
import { TeamBoardItem } from '../types';
import { submitVote } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { X, Play, Lock, AlertCircle, CheckCircle } from 'lucide-react';

interface VotingModalProps {
  team: TeamBoardItem | null;
  isOpen: boolean;
  onClose: () => void;
  onVoteSuccess: () => void;
  isSystemLocked: boolean;
}

export const VotingModal: React.FC<VotingModalProps> = ({
  team,
  isOpen,
  onClose,
  onVoteSuccess,
  isSystemLocked,
}) => {
  const { participant } = useAuth();
  const [vocalScore, setVocalScore] = useState<number | ''>(20);
  const [performanceScore, setPerformanceScore] = useState<number | ''>(20);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLockedByError, setIsLockedByError] = useState(false);

  useEffect(() => {
    if (team) {
      setVocalScore(team.my_vocal_score ?? 20);
      setPerformanceScore(team.my_performance_score ?? 20);
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsLockedByError(false);
    }
  }, [team]);

  if (!isOpen || !team) return null;

  const hasVideo = Boolean(team.video_url);
  const isLocked = isSystemLocked || isLockedByError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isLocked) {
      setErrorMessage('Đã khóa chấm điểm');
      return;
    }

    if (!hasVideo) {
      setErrorMessage('Đội thi chưa có video hợp lệ. Không thể chấm điểm.');
      return;
    }

    const vScore = Number(vocalScore);
    const pScore = Number(performanceScore);

    if (isNaN(vScore) || vScore < 1 || vScore > 25) {
      setErrorMessage('Điểm Thanh nhạc phải từ 1 đến 25');
      return;
    }

    if (isNaN(pScore) || pScore < 1 || pScore > 25) {
      setErrorMessage('Điểm Biểu diễn phải từ 1 đến 25');
      return;
    }

    setIsSubmitting(true);
    const result = await submitVote(team.id, vScore, pScore, participant?.id);
    setIsSubmitting(false);

    if (result.success) {
      setSuccessMessage('Đã gửi điểm thành công');
      onVoteSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      if (result.error?.code === 'ERR_VOTING_LOCKED' || result.error?.status === 403) {
        setIsLockedByError(true);
        setErrorMessage('Đã khóa chấm điểm');
      } else {
        setErrorMessage(result.error?.message || 'Lỗi khi gửi phiếu');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <div className="bg-white border border-slate-300 rounded shadow-2xl w-full max-w-md overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-slate-50">
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

        {/* Locked Alert */}
        {isLocked && (
          <div className="bg-rose-50 border-b border-rose-200 px-3.5 py-2 flex items-center gap-2 text-rose-700 font-mono text-xs">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 text-rose-600" />
            <span>Đã khóa chấm điểm. Không thể gửi hoặc sửa phiếu.</span>
          </div>
        )}

        <div className="p-3.5 space-y-3">
          {/* Video Section */}
          <div className="rounded border border-slate-200 bg-slate-900 aspect-video flex items-center justify-center overflow-hidden">
            {hasVideo ? (
              <video
                key={team.video_url || 'has-vid'}
                src={team.video_url!}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-4 font-mono text-xs text-slate-400">
                <Play className="w-6 h-6 mx-auto mb-1 text-slate-500" />
                <p>Chưa có video trình diễn</p>
              </div>
            )}
          </div>

          {/* Messages */}
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5 font-mono">
              <div className="p-2 rounded border border-slate-200 bg-slate-50">
                <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                  1. Thanh Nhạc (1-25)
                </label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  step="1"
                  required
                  disabled={isLocked || !hasVideo || isSubmitting}
                  value={vocalScore}
                  onChange={(e) =>
                    setVocalScore(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                  }
                  className="oat-input text-center text-lg font-bold"
                />
              </div>

              <div className="p-2 rounded border border-slate-200 bg-slate-50">
                <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                  2. Biểu Diễn (1-25)
                </label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  step="1"
                  required
                  disabled={isLocked || !hasVideo || isSubmitting}
                  value={performanceScore}
                  onChange={(e) =>
                    setPerformanceScore(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                  }
                  className="oat-input text-center text-lg font-bold"
                />
              </div>
            </div>

            {/* Total Indicator */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded border border-slate-200 bg-slate-50 text-xs font-mono">
              <span className="text-slate-500">Điểm trung bình phiếu:</span>
              <span className="font-bold text-slate-900 text-sm">
                {(((Number(vocalScore) || 0) + (Number(performanceScore) || 0)) / 2).toFixed(1)} / 25
              </span>
            </div>

            <button
              type="submit"
              disabled={isLocked || !hasVideo || isSubmitting}
              className="w-full oat-btn oat-btn-primary py-2 text-xs font-mono font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? 'Đang gửi...'
                : isLocked
                ? 'Đã Khóa Chấm Điểm'
                : team.has_voted
                ? 'Cập Nhật Phiếu Điểm'
                : 'Xác Nhận Gửi Điểm'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
