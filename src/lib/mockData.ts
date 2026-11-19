import { TeamBoardItem, SystemSettings, Participant, ImportSummary } from '../types';
import { INITIAL_EMPLOYEES } from '../data/employees';

export const INITIAL_MOCK_SETTINGS: SystemSettings = {
  id: 1,
  is_locked: false,
  locked_at: null,
  locked_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const INITIAL_MOCK_TEAMS: TeamBoardItem[] = [
  {
    id: 'team-1',
    name: 'Khoa Cấp Cứu - Bài Ca Hy Vọng',
    performance_order: 1,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-1/sample.mp4',
    audience_score: 22.5,
    vote_count: 14,
    teammate_bonus: 3,
    lucky_star: 5,
    has_voted: false,
    my_vocal_score: null,
    my_performance_score: null,
  },
  {
    id: 'team-2',
    name: 'Khoa Phụ Sản - Thơ tình của núi',
    performance_order: 2,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-2/sample.mp4',
    audience_score: 24.0,
    vote_count: 18,
    teammate_bonus: 0,
    lucky_star: 0,
    has_voted: false,
    my_vocal_score: null,
    my_performance_score: null,
  },
  {
    id: 'team-3',
    name: 'Khối Ngoại Khoa - Tàu Anh Qua Núi',
    performance_order: 3,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-3/sample.mp4',
    audience_score: 21.8,
    vote_count: 12,
    teammate_bonus: 3,
    lucky_star: -5,
    has_voted: false,
    my_vocal_score: null,
    my_performance_score: null,
  },
  {
    id: 'team-4',
    name: 'Khoa Nhi - Đất Nước Trọn Niềm Vui',
    performance_order: 4,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-4/sample.mp4',
    audience_score: 23.5,
    vote_count: 16,
    teammate_bonus: 0,
    lucky_star: 5,
    has_voted: false,
    my_vocal_score: null,
    my_performance_score: null,
  },
  {
    id: 'team-5',
    name: 'Khối Dược - Mùa Xuân Làng Lúa',
    performance_order: 5,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-5/sample.mp4',
    audience_score: 19.5,
    vote_count: 9,
    teammate_bonus: 3,
    lucky_star: 0,
    has_voted: false,
    my_vocal_score: null,
    my_performance_score: null,
  },
];

export const INITIAL_MOCK_PARTICIPANTS: Participant[] = INITIAL_EMPLOYEES;

export function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

class MockStore {
  private settings: SystemSettings;
  private teams: TeamBoardItem[];
  private participants: Participant[];
  private serverVersion = 0;
  private listeners: Array<() => void> = [];
  private currentParticipantId: string | undefined = undefined;

  constructor() {
    this.settings = INITIAL_MOCK_SETTINGS;
    this.teams = INITIAL_MOCK_TEAMS;
    this.participants = INITIAL_MOCK_PARTICIPANTS;

    // Start background sync with local server immediately in browser
    if (typeof window !== 'undefined') {
      this.syncWithServer();
      setInterval(() => {
        this.syncWithServer();
      }, 1500);
    }
  }

  public setParticipantContext(participantId?: string) {
    this.currentParticipantId = participantId;
  }

  public async syncWithServer(): Promise<void> {
    try {
      const url = this.currentParticipantId
        ? `/api/state?participant_id=${encodeURIComponent(this.currentParticipantId)}`
        : '/api/state';

      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      if (data && data.version !== undefined && data.version !== this.serverVersion) {
        this.serverVersion = data.version;
        if (data.settings) this.settings = data.settings;
        if (Array.isArray(data.teams)) this.teams = data.teams;
        if (Array.isArray(data.participants)) this.participants = data.participants;

        this.listeners.forEach((l) => l());
      }
    } catch {
      // Offline fallback: keep current in-memory data
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getSettings(): SystemSettings {
    return { ...this.settings };
  }

  public getTeams(participantId?: string): TeamBoardItem[] {
    if (participantId && participantId !== this.currentParticipantId) {
      this.currentParticipantId = participantId;
      this.syncWithServer();
    }
    return [...this.teams];
  }

  public getParticipants(): Participant[] {
    return [...this.participants];
  }

  public searchParticipants(query: string, limit = 20): Participant[] {
    if (!query || !query.trim()) {
      return this.participants.filter((p) => p.is_active).slice(0, limit);
    }
    const cleanQuery = removeDiacritics(query.trim());
    return this.participants
      .filter((p) => {
        if (!p.is_active) return false;
        const nameClean = removeDiacritics(p.name);
        const deptClean = removeDiacritics(p.department || '');
        return nameClean.includes(cleanQuery) || deptClean.includes(cleanQuery);
      })
      .slice(0, limit);
  }

  public async lockSystem(): Promise<boolean> {
    try {
      const res = await fetch('/api/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: true, locked_by: 'admin' }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        this.settings = data.settings;
      }
      await this.syncWithServer();
      return true;
    } catch {
      this.settings.is_locked = true;
      this.settings.locked_at = new Date().toISOString();
      this.listeners.forEach((l) => l());
      return true;
    }
  }

  public async unlockSystem(_reason: string): Promise<boolean> {
    try {
      const res = await fetch('/api/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: false }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        this.settings = data.settings;
      }
      await this.syncWithServer();
      return true;
    } catch {
      this.settings.is_locked = false;
      this.settings.locked_at = null;
      this.listeners.forEach((l) => l());
      return true;
    }
  }

  public async submitVote(participantId: string, teamId: string, vocal: number, perf: number) {
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: participantId,
          team_id: teamId,
          vocal_score: vocal,
          performance_score: perf,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await this.syncWithServer();
        return { success: true, voteId: data.voteId };
      } else {
        return {
          success: false,
          error: data.error || {
            code: 'ERR_VOTE_FAILED',
            message: 'Lỗi gửi phiếu',
            status: res.status,
          },
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'ERR_NETWORK', message: err.message || 'Mất kết nối máy chủ', status: 500 },
      };
    }
  }

  public async createTeam(name: string, performance_order?: number, video_url?: string) {
    try {
      const res = await fetch('/api/create-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, performance_order, video_url }),
      });
      const data = await res.json();
      await this.syncWithServer();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async updateTeam(id: string, updates: {
    name?: string;
    performance_order?: number;
    teammate_bonus?: number;
    lucky_star?: number;
    video_url?: string | null;
  }) {
    try {
      const res = await fetch('/api/update-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await res.json();
      await this.syncWithServer();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteTeam(id: string) {
    try {
      const res = await fetch('/api/delete-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      await this.syncWithServer();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async updateTeamModifiers(teamId: string, bonus: number, star: number) {
    try {
      await fetch('/api/update-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teamId,
          teammate_bonus: bonus,
          lucky_star: star,
        }),
      });
      await this.syncWithServer();
    } catch {
      const t = this.teams.find((item) => item.id === teamId);
      if (t) {
        t.teammate_bonus = bonus;
        t.lucky_star = star;
        this.listeners.forEach((l) => l());
      }
    }
  }

  public async updateTeamVideo(teamId: string, videoUrl: string | null) {
    try {
      await fetch('/api/update-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teamId,
          video_url: videoUrl,
        }),
      });
      await this.syncWithServer();
    } catch {
      const t = this.teams.find((item) => item.id === teamId);
      if (t) {
        t.video_url = videoUrl;
        this.listeners.forEach((l) => l());
      }
    }
  }

  public async uploadVideoFile(teamId: string, file: File): Promise<{ success: boolean; video_url?: string; error?: string }> {
    try {
      const res = await fetch(`/api/upload-video?team_id=${encodeURIComponent(teamId)}&filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'video/mp4',
        },
        body: file,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await this.syncWithServer();
        return { success: true, video_url: data.video_url };
      } else {
        return { success: false, error: data.error || 'Lỗi khi upload video' };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối upload' };
    }
  }

  public async toggleParticipant(id: string) {
    try {
      await fetch('/api/toggle-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await this.syncWithServer();
    } catch {
      const p = this.participants.find((item) => item.id === id);
      if (p) {
        p.is_active = !p.is_active;
        this.listeners.forEach((l) => l());
      }
    }
  }

  public async deactivateAllParticipants() {
    try {
      await fetch('/api/toggle-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate_all' }),
      });
      await this.syncWithServer();
    } catch {
      this.participants.forEach((p) => (p.is_active = false));
      this.listeners.forEach((l) => l());
    }
  }

  public async importParticipants(
    rows: Array<{ name: string; department?: string; username?: string }>
  ): Promise<ImportSummary> {
    try {
      const res = await fetch('/api/import-participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      await this.syncWithServer();
      return {
        total: rows.length,
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        failed: 0,
        results: [],
      };
    } catch {
      return {
        total: rows.length,
        created: 0,
        skipped: 0,
        failed: rows.length,
        results: [],
      };
    }
  }

  public async resetToDefault() {
    try {
      await fetch('/api/reset', { method: 'POST' });
      await this.syncWithServer();
    } catch {
      this.settings = { ...INITIAL_MOCK_SETTINGS };
      this.teams = [...INITIAL_MOCK_TEAMS];
      this.participants = [...INITIAL_MOCK_PARTICIPANTS];
      this.listeners.forEach((l) => l());
    }
  }
}

export const mockStore = new MockStore();
