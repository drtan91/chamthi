import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { mockStore, removeDiacritics } from '../lib/mockData';
import { supabase, isMockMode, normalizeParticipantId } from '../lib/supabase';
import { Participant } from '../types';
import { X, Search, Check, Building2, User, AlertCircle, ShieldAlert, Lock, ShieldCheck } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { loginByParticipant, loginAdmin } = useAuth();
  const [isAdminMode, setIsAdminMode] = useState(false);

  // Employee search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Participant | null>(null);

  // Admin state
  const [adminPassword, setAdminPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [dbParticipants, setDbParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchReal = async () => {
      if (isMockMode) {
        setDbParticipants(mockStore.getParticipants().filter((p) => p.is_active));
        return;
      }

      const { data, error } = await supabase
        .from('participants')
        .select('id, username, name, department, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (mounted) {
        if (!error && data && data.length > 0) {
          setDbParticipants(data as Participant[]);
        } else {
          setDbParticipants(mockStore.getParticipants().filter((p) => p.is_active));
        }
      }
    };

    if (isOpen) {
      fetchReal();
    }
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Get full list of participants from state or store
  const allParticipants = useMemo(() => {
    const list = dbParticipants.length > 0 ? dbParticipants : mockStore.getParticipants().filter((p) => p.is_active);
    return list.map((p) => ({
      ...p,
      id: normalizeParticipantId(p.id) || p.id,
    }));
  }, [dbParticipants, isOpen]);

  // Filtered participants based on query
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) {
      return allParticipants.slice(0, 15);
    }
    const cleanQ = removeDiacritics(searchQuery.trim());
    return allParticipants
      .filter((p) => {
        const nameClean = removeDiacritics(p.name);
        const deptClean = removeDiacritics(p.department || '');
        return nameClean.includes(cleanQ) || deptClean.includes(cleanQ);
      })
      .slice(0, 30);
  }, [allParticipants, searchQuery]);

  if (!isOpen) return null;

  const handleSelectAndLogin = async (employee: Participant) => {
    setSelectedEmployee(employee);
    setErrorMessage(null);
    setIsLoading(true);
    const res = await loginByParticipant(employee);
    setIsLoading(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.error || 'Đăng nhập không thành công');
    }
  };

  const handleConfirmLogin = async () => {
    if (!selectedEmployee) {
      setErrorMessage('Vui lòng chọn nhân viên từ danh sách');
      return;
    }
    await handleSelectAndLogin(selectedEmployee);
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setErrorMessage('Vui lòng nhập mật khẩu Admin');
      return;
    }

    if (adminPassword.trim() !== '855986') {
      setErrorMessage('Mật khẩu Admin không chính xác. Vui lòng thử lại.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    const res = await loginAdmin('admin@hoithihat.com', adminPassword.trim());
    setIsLoading(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.error || 'Đăng nhập Admin thất bại');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/50 backdrop-blur-[2px]">
      <div className="bg-white border border-slate-300 rounded shadow-2xl w-full max-w-md overflow-hidden my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            {isAdminMode ? (
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                ADMIN
              </span>
            ) : (
              <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-300">
                KHÁN GIẢ
              </span>
            )}
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">
              {isAdminMode ? 'Đăng Nhập Quản Trị Viên' : 'Đăng Nhập Chấm Điểm'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3 sm:p-4 space-y-3 font-sans text-xs flex-1 overflow-y-auto">
          {errorMessage && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 font-mono text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Ô Chọn Chế Độ Đăng Nhập ADMIN (Theo yêu cầu) */}
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/80 flex items-center justify-between">
            <label htmlFor="admin-mode-toggle" className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id="admin-mode-toggle"
                type="checkbox"
                checked={isAdminMode}
                onChange={(e) => {
                  setIsAdminMode(e.target.checked);
                  setErrorMessage(null);
                }}
                className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
              />
              <span className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                Đăng nhập tài khoản ADMIN (toàn quyền)
              </span>
            </label>
            <span className="text-[10px] font-mono text-slate-500">
              {isAdminMode ? 'Đang chọn Admin' : 'Khán giả mặc định'}
            </span>
          </div>

          {isAdminMode ? (
            /* ADMIN LOGIN FORM */
            <form onSubmit={handleAdminSubmit} className="space-y-3 pt-1">
              <div className="p-3 rounded border border-amber-200 bg-amber-50/60 space-y-2">
                <label className="block text-[11px] font-mono text-amber-900 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  Mật khẩu ADMIN:
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Nhập pass: 855986"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="oat-input font-mono text-sm tracking-wider font-bold"
                />
                <p className="text-[10px] text-slate-600 font-mono">
                  * Dành riêng cho Ban tổ chức: quản lý đội thi, video, điểm thưởng, ngôi sao và khóa hệ thống.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminMode(false);
                    setErrorMessage(null);
                  }}
                  className="oat-btn flex-1 py-2 text-xs font-mono"
                >
                  ← Về khán giả
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="oat-btn oat-btn-primary flex-1 py-2 text-xs font-mono font-bold"
                >
                  {isLoading ? 'Đang kiểm tra...' : 'Vào Quyền Admin'}
                </button>
              </div>
            </form>
          ) : (
            /* EMPLOYEE / PARTICIPANT ZERO-PASSWORD LOGIN */
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-600 font-bold mb-1 uppercase tracking-wider">
                  Tìm tên nhân viên (Không cần mật khẩu):
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Gõ tên để tìm kiếm (VD: Tu, Nam Hung, Phu...)"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedEmployee(null);
                    }}
                    className="oat-input pl-8 font-sans text-xs sm:text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selected Employee Display Box */}
              {selectedEmployee && (
                <div className="p-2.5 rounded border border-emerald-300 bg-emerald-50 text-slate-900 space-y-1 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-emerald-800 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" /> Đã chọn nhân viên:
                    </span>
                    <button
                      onClick={() => setSelectedEmployee(null)}
                      className="text-[10px] text-slate-500 hover:underline"
                    >
                      Đổi người khác
                    </button>
                  </div>
                  <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-700" />
                    <span>{selectedEmployee.name}</span>
                  </div>
                  <div className="text-xs text-slate-700 flex items-center gap-1.5 font-medium">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Khoa/Phòng: <strong className="text-slate-900">{selectedEmployee.department || 'Bệnh viện'}</strong></span>
                  </div>
                </div>
              )}

              {/* Employee Selection List */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-slate-500">
                  Danh sách kết quả ({filteredParticipants.length} / {allParticipants.length} nhân viên):
                </span>
                <div className="border border-slate-200 rounded max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50">
                  {filteredParticipants.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 font-mono text-xs">
                      Không tìm thấy nhân viên nào với từ khóa "{searchQuery}"
                    </div>
                  ) : (
                    filteredParticipants.map((emp) => {
                      const isSelected = selectedEmployee?.id === emp.id;
                      return (
                        <div
                          key={emp.id}
                          onClick={() => handleSelectAndLogin(emp)}
                          className={`p-2 px-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-100 text-slate-950 font-bold'
                              : 'hover:bg-white text-slate-800'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                              <span>{emp.name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-700 inline" />}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{emp.department || 'Bệnh viện'}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="oat-btn text-[11px] py-0.5 px-2 font-mono whitespace-nowrap"
                          >
                            Chọn
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Button */}
              {selectedEmployee && (
                <button
                  type="button"
                  onClick={handleConfirmLogin}
                  disabled={isLoading}
                  className="w-full oat-btn oat-btn-primary py-2 text-xs font-mono font-bold"
                >
                  {isLoading ? 'Đang vào...' : `Vào Chấm Điểm (${selectedEmployee.name})`}
                </button>
              )}
            </div>
          )}

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] text-slate-500 hover:text-slate-800 font-mono"
            >
              Đóng và xem bảng điểm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
