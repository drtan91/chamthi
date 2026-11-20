import React, { useState, useEffect } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { mockStore } from '../lib/mockData';
import { supabase, isMockMode } from '../lib/supabase';

interface AddTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  nextOrder: number;
}

export const AddTeamModal: React.FC<AddTeamModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  nextOrder,
}) => {
  const [name, setName] = useState('');
  const [order, setOrder] = useState<number>(nextOrder);
  const [videoUrl, setVideoUrl] = useState('/videos/sample.mp4');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setOrder(nextOrder);
      setVideoUrl('/videos/sample.mp4');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, nextOrder]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMessage('Vui lòng nhập tên đội thi / tiết mục');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isMockMode) {
        const result = await mockStore.createTeam(cleanName, order, videoUrl.trim() || undefined);
        if (result && result.success === false) {
          throw new Error(result.error || 'Lỗi khi tạo đội thi');
        }
        onCreated();
        onClose();
        return;
      }

      // Supabase mode
      const { error } = await supabase.from('teams').insert({
        name: cleanName,
        performance_order: order,
        display_order: order,
        video_url: videoUrl.trim() || null,
        teammate_bonus: 0,
        lucky_star: 0,
      });

      if (error) throw error;

      onCreated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi thêm đội thi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <div className="bg-white border border-slate-300 rounded shadow-2xl w-full max-w-sm overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs sm:text-sm">
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Thêm Đội Thi Mới</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3.5 space-y-3 font-sans">
          {errorMessage && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-2">
            <div>
              <label className="block text-xs font-mono text-slate-600 mb-1 font-semibold">
                Thứ tự biểu diễn (STT):
              </label>
              <input
                type="number"
                min={1}
                value={order}
                onChange={(e) => setOrder(Math.max(1, parseInt(e.target.value) || 1))}
                className="oat-input text-xs font-mono font-bold w-24"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-600 mb-1 font-semibold">
                Tên đội thi / Khoa phòng - Tiết mục:
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Khoa Cấp Cứu - Bài Ca Hy Vọng"
                className="oat-input text-xs"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-600 mb-1">
                Link video ban đầu (tùy chọn):
              </label>
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="/videos/sample.mp4"
                className="oat-input text-xs font-mono text-slate-600"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                Mặc định dùng video mẫu, có thể thay đổi sau trong chi tiết đội.
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 font-mono text-xs">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="oat-btn"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="oat-btn oat-btn-primary font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Đang thêm...' : 'Thêm Đội'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
