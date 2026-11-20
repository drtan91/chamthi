/**
 * exportVotes.ts
 * Client-side export: tổng hợp danh sách khán giả đã chấm điểm cho từng tiết mục → Excel.
 * Uses the `xlsx` library (already in package.json).
 */
import * as XLSX from 'xlsx';
import { supabase, isMockMode } from './supabase';
import { mockStore } from './mockData';

export interface VoteRow {
  team_order: number;
  team_name: string;
  participant_name: string;
  department: string;
  vocal_score: number;
  performance_score: number;
  total: number;
  voted_at: string;
}

/**
 * Fetch all votes joined with participant and team info, then export as .xlsx Blob.
 */
export async function exportVotesAsExcel(): Promise<{ blob: Blob; filename: string }> {
  // ── 1. Fetch teams ──────────────────────────────────────────────────────────
  let teamsMap: Record<string, { name: string; order: number }> = {};

  if (isMockMode) {
    const mockTeams = mockStore.getTeams();
    for (const t of mockTeams) {
      teamsMap[t.id] = { name: t.name, order: t.performance_order ?? 0 };
    }
  } else {
    const { data: teamsData, error: teamsErr } = await supabase
      .from('teams')
      .select('id, name, performance_order');
    if (teamsErr) throw new Error('Không thể tải dữ liệu đội thi: ' + teamsErr.message);
    for (const t of teamsData ?? []) {
      teamsMap[t.id] = { name: t.name, order: t.performance_order ?? 0 };
    }
  }

  // ── 2. Fetch participants ───────────────────────────────────────────────────
  let participantsMap: Record<string, { name: string; department: string }> = {};

  if (isMockMode) {
    const mockParts = mockStore.getParticipants();
    for (const p of mockParts) {
      participantsMap[p.id] = {
        name: p.name || p.username || p.id,
        department: (p as any).department || '',
      };
    }
  } else {
    const { data: partsData, error: partsErr } = await supabase
      .from('participants')
      .select('id, name, username, department');
    if (partsErr) throw new Error('Không thể tải dữ liệu khán giả: ' + partsErr.message);
    for (const p of partsData ?? []) {
      participantsMap[p.id] = {
        name: p.name || p.username || p.id,
        department: p.department || '',
      };
    }
  }

  // ── 3. Fetch votes ──────────────────────────────────────────────────────────
  let rawVotes: Array<{
    participant_id: string;
    team_id: string;
    vocal_score: number;
    performance_score: number;
    updated_at?: string;
    created_at?: string;
  }> = [];

  if (isMockMode) {
    // mockStore does not expose raw votes; return empty (export only meaningful in real mode)
    rawVotes = (mockStore as any).getVotes ? (mockStore as any).getVotes() : [];
  } else {
    const { data: votesData, error: votesErr } = await supabase
      .from('votes')
      .select('participant_id, team_id, vocal_score, performance_score, updated_at, created_at')
      .order('team_id');
    if (votesErr) throw new Error('Không thể tải dữ liệu phiếu chấm: ' + votesErr.message);
    rawVotes = votesData ?? [];
  }

  if (rawVotes.length === 0) {
    // Return an empty workbook with header only
    return buildExcel([], teamsMap);
  }

  // ── 4. Build rows grouped by team ──────────────────────────────────────────
  const rows: VoteRow[] = rawVotes.map((v) => {
    const team = teamsMap[v.team_id] ?? { name: v.team_id, order: 0 };
    const part = participantsMap[v.participant_id] ?? {
      name: v.participant_id,
      department: '',
    };
    const ts = v.updated_at || v.created_at || '';
    const formatted =
      ts
        ? new Date(ts).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

    return {
      team_order: team.order,
      team_name: team.name,
      participant_name: part.name,
      department: part.department,
      vocal_score: v.vocal_score,
      performance_score: v.performance_score,
      total: v.vocal_score + v.performance_score,
      voted_at: formatted,
    };
  });

  // Sort: by team order asc, then participant name asc
  rows.sort((a, b) =>
    a.team_order !== b.team_order
      ? a.team_order - b.team_order
      : a.participant_name.localeCompare(b.participant_name, 'vi')
  );

  return buildExcel(rows, teamsMap);
}

// ── 5. Build the Excel workbook ───────────────────────────────────────────────
function buildExcel(
  rows: VoteRow[],
  teamsMap: Record<string, { name: string; order: number }>
): { blob: Blob; filename: string } {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Chi tiết từng phiếu ---
  const detailHeader = [
    'STT',
    'STT Tiết Mục',
    'Tiết Mục',
    'Tên Khán Giả',
    'Khoa / Phòng Ban',
    'Điểm Giọng Hát',
    'Điểm Khuấy Động',
    'Tổng Điểm',
    'Thời Gian Chấm',
  ];

  const detailData = rows.map((r, i) => [
    i + 1,
    r.team_order,
    r.team_name,
    r.participant_name,
    r.department,
    r.vocal_score,
    r.performance_score,
    r.total,
    r.voted_at,
  ]);

  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailData]);

  // Column widths
  wsDetail['!cols'] = [
    { wch: 5 },   // STT
    { wch: 8 },   // STT tiết mục
    { wch: 30 },  // Tiết mục
    { wch: 25 },  // Tên khán giả
    { wch: 20 },  // Khoa
    { wch: 14 },  // Điểm giọng hát
    { wch: 14 },  // Điểm khuấy động
    { wch: 12 },  // Tổng
    { wch: 18 },  // Thời gian
  ];

  XLSX.utils.book_append_sheet(wb, wsDetail, 'Chi Tiet Phieu Cham');

  // --- Sheet 2: Tổng hợp theo tiết mục ---
  const summaryHeader = [
    'STT Tiết Mục',
    'Tiết Mục',
    'Số Khán Giả Đã Chấm',
    'TB Điểm Giọng Hát',
    'TB Điểm Khuấy Động',
    'TB Tổng Điểm',
  ];

  // Group rows by team
  const byTeam: Record<number, VoteRow[]> = {};
  for (const r of rows) {
    if (!byTeam[r.team_order]) byTeam[r.team_order] = [];
    byTeam[r.team_order].push(r);
  }

  // Also include teams with zero votes
  const allTeams = Object.values(teamsMap)
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ order: t.order, name: t.name }));

  const summaryData = allTeams.map((t) => {
    const teamRows = byTeam[t.order] ?? [];
    const count = teamRows.length;
    const avgVocal =
      count > 0
        ? +(teamRows.reduce((s, r) => s + r.vocal_score, 0) / count).toFixed(2)
        : 0;
    const avgPerf =
      count > 0
        ? +(teamRows.reduce((s, r) => s + r.performance_score, 0) / count).toFixed(2)
        : 0;
    const avgTotal =
      count > 0
        ? +(teamRows.reduce((s, r) => s + r.total, 0) / count).toFixed(2)
        : 0;
    return [t.order, t.name, count, avgVocal, avgPerf, avgTotal];
  });

  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryData]);
  wsSummary['!cols'] = [
    { wch: 10 },
    { wch: 30 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tong Hop Tiet Muc');

  // Write workbook → ArrayBuffer → Blob
  const arrayBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const now = new Date();
  const stamp =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
    `_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `BaoCao_ChamDiem_${stamp}.xlsx`;

  return { blob, filename };
}
