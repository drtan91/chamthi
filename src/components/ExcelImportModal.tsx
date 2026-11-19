import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase, isMockMode } from '../lib/supabase';
import { mockStore } from '../lib/mockData';
import { ImportSummary } from '../types';
import { X, FileSpreadsheet, Upload, AlertTriangle, Check, AlertCircle } from 'lucide-react';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setErrorMessage('Chỉ chấp nhận file Excel (.xlsx, .xls)');
      return;
    }

    setFile(selectedFile);
    setErrorMessage(null);
    setImportSummary(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

      if (rawData.length < 2) {
        setErrorMessage('File trống (cần ít nhất dòng tiêu đề và 1 dòng dữ liệu)');
        return;
      }

      const headers = rawData[0].map((h: any) => String(h || '').trim().toLowerCase());
      
      // Flexible column finder
      let nameIdx = headers.findIndex((h: string) => h.includes('tên') || h.includes('name') || h.includes('họ'));
      let deptIdx = headers.findIndex((h: string) => h.includes('phòng') || h.includes('khoa') || h.includes('dept') || h.includes('bộ phận'));
      let usernameIdx = headers.indexOf('username');

      if (nameIdx === -1 && usernameIdx !== -1) {
        nameIdx = usernameIdx;
      }
      if (nameIdx === -1) {
        // Fallback to column 0 if 2 columns
        if (rawData[0].length >= 1) nameIdx = 0;
        if (rawData[0].length >= 2) deptIdx = 1;
      }

      const previews = rawData.slice(1, 6).map((row, idx) => ({
        stt: idx + 1,
        name: nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : '',
        department: deptIdx !== -1 && row[deptIdx] ? String(row[deptIdx]).trim() : '—',
      }));

      setPreviewRows(previews);
    } catch (err: any) {
      setErrorMessage('Lỗi đọc file: ' + err.message);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setImportSummary(null);

    try {
      if (isMockMode) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        const headers = rawData[0].map((h: any) => String(h || '').trim().toLowerCase());
        let nameIdx = headers.findIndex((h: string) => h.includes('tên') || h.includes('name') || h.includes('họ'));
        let deptIdx = headers.findIndex((h: string) => h.includes('phòng') || h.includes('khoa') || h.includes('dept') || h.includes('bộ phận'));
        let usernameIdx = headers.indexOf('username');

        if (nameIdx === -1 && usernameIdx !== -1) nameIdx = usernameIdx;
        if (nameIdx === -1 && rawData[0].length >= 1) {
          nameIdx = 0;
          if (rawData[0].length >= 2) deptIdx = 1;
        }

        const rowsToImport: Array<{ name: string; department?: string; username?: string }> = [];
        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || !row[nameIdx]) continue;
          const nameVal = String(row[nameIdx]).trim();
          if (!nameVal || nameVal.toUpperCase().startsWith('TỔNG CỘNG')) continue;

          rowsToImport.push({
            name: nameVal,
            department: deptIdx !== -1 && row[deptIdx] ? String(row[deptIdx]).trim() : '',
            username: usernameIdx !== -1 && row[usernameIdx] ? String(row[usernameIdx]).trim() : undefined,
          });
        }

        const summary = await mockStore.importParticipants(rowsToImport);
        setImportSummary(summary);
        onImportComplete();
        setIsProcessing(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('import-participants', {
        body: formData,
      });

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Không nhận được phản hồi');

      setImportSummary(data as ImportSummary);
      onImportComplete();
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi import file');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <div className="bg-white border border-slate-300 rounded shadow-2xl w-full max-w-lg overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">Import Người Tham Gia (Excel)</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 space-y-3 font-sans text-xs">
          {/* Instructions */}
          <div className="p-2 rounded border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-600 space-y-0.5">
            <p className="text-slate-900 font-bold">Cấu trúc file Excel hỗ trợ:</p>
            <p>• 2 cột: Tên nhân viên | Phòng ban</p>
            <p>• hoặc 4 cột: STT | username | password | name</p>
            <p className="text-slate-500">* Tự động bỏ qua trùng lặp khi import lại. Đăng nhập không cần mật khẩu.</p>
          </div>

          {errorMessage && (
            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 font-mono text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!importSummary && (
            <div className="space-y-2.5">
              <div className="p-3.5 border border-dashed border-slate-300 rounded bg-slate-50 text-center font-mono">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700 mx-auto mb-1" />
                <p className="text-slate-700 text-xs font-sans mb-1">
                  {file ? file.name : 'Chọn file Excel (.xlsx)'}
                </p>
                <label className="oat-btn oat-btn-primary text-xs font-mono cursor-pointer mt-1">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{file ? 'Đổi file khác' : 'Chọn File'}</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    disabled={isProcessing}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {previewRows.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono text-slate-600">
                    Xem trước ({previewRows.length} dòng đầu):
                  </span>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="p-1 px-2.5">STT</th>
                          <th className="p-1 px-2.5">Tên Nhân Viên</th>
                          <th className="p-1 px-2.5">Khoa / Phòng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {previewRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-1 px-2.5 text-slate-400">{r.stt}</td>
                            <td className="p-1 px-2.5 text-slate-900 font-semibold">{r.name}</td>
                            <td className="p-1 px-2.5 text-slate-600">{r.department || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={isProcessing}
                    className="w-full oat-btn oat-btn-primary py-2 text-xs font-mono font-bold"
                  >
                    {isProcessing ? 'Đang import...' : 'Xác Nhận Import'}
                  </button>
                </div>
              )}
            </div>
          )}

          {importSummary && (
            <div className="space-y-2.5 font-mono">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-1.5 border border-slate-200 rounded bg-slate-50">
                  <span className="block font-bold text-slate-900">{importSummary.total}</span>
                  <span className="text-[10px] text-slate-500">Tổng</span>
                </div>
                <div className="p-1.5 border border-emerald-200 rounded bg-emerald-50">
                  <span className="block font-bold text-emerald-800">{importSummary.created}</span>
                  <span className="text-[10px] text-emerald-700">Tạo mới</span>
                </div>
                <div className="p-1.5 border border-amber-200 rounded bg-amber-50">
                  <span className="block font-bold text-amber-800">{importSummary.skipped}</span>
                  <span className="text-[10px] text-amber-700">Bỏ qua</span>
                </div>
                <div className="p-1.5 border border-rose-200 rounded bg-rose-50">
                  <span className="block font-bold text-rose-800">{importSummary.failed}</span>
                  <span className="text-[10px] text-rose-700">Lỗi</span>
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded text-[11px]">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-1 px-2">Dòng</th>
                      <th className="p-1 px-2">Username</th>
                      <th className="p-1 px-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {importSummary.results.map((res, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-1 px-2 text-slate-400">{res.row}</td>
                        <td className="p-1 px-2 text-slate-900 font-semibold">{res.username}</td>
                        <td className="p-1 px-2">
                          {res.status === 'created' && (
                            <span className="text-emerald-700 inline-flex items-center gap-1">
                              <Check className="w-3 h-3" /> tạo mới
                            </span>
                          )}
                          {res.status === 'skipped' && (
                            <span className="text-amber-700 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> đã có
                            </span>
                          )}
                          {res.status === 'failed' && (
                            <span className="text-rose-700">lỗi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => {
                  setImportSummary(null);
                  setFile(null);
                  setPreviewRows([]);
                }}
                className="w-full oat-btn text-xs font-mono"
              >
                Nhập file khác
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
