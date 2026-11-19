import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

interface SystemSettings {
  id: number;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamItem {
  id: string;
  name: string;
  performance_order: number;
  video_url: string | null;
  video_storage_path: string | null;
  teammate_bonus: number;
  lucky_star: number;
}

interface ParticipantItem {
  id: string;
  username?: string;
  name: string;
  department?: string;
  is_active: boolean;
}

interface VoteItem {
  id: string;
  participant_id: string;
  team_id: string;
  vocal_score: number;
  performance_score: number;
  created_at: string;
}

interface DbSchema {
  version: number;
  settings: SystemSettings;
  teams: TeamItem[];
  participants: ParticipantItem[];
  votes: VoteItem[];
}

const DB_PATH = path.resolve(process.cwd(), 'data/server_db.json');
const VIDEO_DIR = path.resolve(process.cwd(), 'public/videos/teams');

const DEFAULT_TEAMS: TeamItem[] = [
  {
    id: 'team-1',
    name: 'Khoa Cấp Cứu - Bài Ca Hy Vọng',
    performance_order: 1,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-1/sample.mp4',
    teammate_bonus: 3,
    lucky_star: 5,
  },
  {
    id: 'team-2',
    name: 'Khoa Phụ Sản - Thơ tình của núi',
    performance_order: 2,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-2/sample.mp4',
    teammate_bonus: 0,
    lucky_star: 0,
  },
  {
    id: 'team-3',
    name: 'Khối Ngoại Khoa - Tàu Anh Qua Núi',
    performance_order: 3,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-3/sample.mp4',
    teammate_bonus: 3,
    lucky_star: -5,
  },
  {
    id: 'team-4',
    name: 'Khoa Nhi - Đất Nước Trọn Niềm Vui',
    performance_order: 4,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-4/sample.mp4',
    teammate_bonus: 0,
    lucky_star: 5,
  },
  {
    id: 'team-5',
    name: 'Khối Dược - Mùa Xuân Làng Lúa',
    performance_order: 5,
    video_url: '/videos/sample.mp4',
    video_storage_path: 'teams/team-5/sample.mp4',
    teammate_bonus: 3,
    lucky_star: 0,
  },
];

function getDefaultParticipants(): ParticipantItem[] {
  try {
    const empPath = path.resolve(process.cwd(), 'src/data/employees.ts');
    if (fs.existsSync(empPath)) {
      const content = fs.readFileSync(empPath, 'utf8');
      const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (err) {
    console.error('Error loading default employees:', err);
  }
  return [];
}

let memoryDb: DbSchema | null = null;

function loadDb(): DbSchema {
  if (memoryDb && memoryDb.teams.length > 0) return memoryDb;
  if (fs.existsSync(DB_PATH)) {
    try {
      const content = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.teams) && parsed.teams.length > 0) {
        memoryDb = parsed;
        return memoryDb!;
      }
    } catch (e) {
      console.error('[LocalServer] Error parsing db file, re-reading...', e);
    }
  }

  // Fallback default
  memoryDb = {
    version: 1,
    settings: {
      id: 1,
      is_locked: false,
      locked_at: null,
      locked_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    teams: [...DEFAULT_TEAMS],
    participants: getDefaultParticipants(),
    votes: [],
  };
  saveDb(memoryDb);
  return memoryDb;
}

function saveDb(db: DbSchema) {
  memoryDb = db;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[LocalServer] Failed to write db:', err);
  }
}

function parseJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

export function localServerPlugin(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url || '';

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.end();
      return;
    }

    if (!url.startsWith('/api/')) {
      return next();
    }

    const db = loadDb();
    const urlObj = new URL(url, 'http://localhost:3000');
    const pathname = urlObj.pathname;

    // 1. GET /api/state
    if (req.method === 'GET' && pathname === '/api/state') {
      const participantId = urlObj.searchParams.get('participant_id') || undefined;

      const computedTeams = db.teams.map((t) => {
        const teamVotes = db.votes.filter((v) => v.team_id === t.id);
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

        const myVote = participantId
          ? teamVotes.find((v) => v.participant_id === participantId)
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

      return sendJson(res, 200, {
        version: db.version,
        settings: db.settings,
        teams: computedTeams,
        participants: db.participants,
      });
    }

    // 2. POST /api/vote
    if (req.method === 'POST' && pathname === '/api/vote') {
      try {
        const body = await parseJsonBody(req);
        const { participant_id, team_id, vocal_score, performance_score } = body;

        if (db.settings.is_locked) {
          return sendJson(res, 403, {
            success: false,
            error: {
              code: 'ERR_VOTING_LOCKED',
              message: 'Đã khóa chấm điểm',
              status: 403,
            },
          });
        }

        const participant = db.participants.find((p) => p.id === participant_id);
        if (participant && !participant.is_active) {
          return sendJson(res, 403, {
            success: false,
            error: {
              code: 'ERR_INACTIVE_PARTICIPANT',
              message: 'Tài khoản đã bị vô hiệu hóa',
              status: 403,
            },
          });
        }

        const team = db.teams.find((t) => t.id === team_id);
        if (!team || !team.video_url) {
          return sendJson(res, 400, {
            success: false,
            error: {
              code: 'ERR_TEAM_NO_VIDEO',
              message: 'Đội thi chưa có video hợp lệ',
              status: 400,
            },
          });
        }

        if (
          typeof vocal_score !== 'number' ||
          vocal_score < 1 ||
          vocal_score > 25 ||
          typeof performance_score !== 'number' ||
          performance_score < 1 ||
          performance_score > 25
        ) {
          return sendJson(res, 400, {
            success: false,
            error: {
              code: 'ERR_INVALID_SCORE_RANGE',
              message: 'Điểm số phải trong khoảng từ 1.0 đến 25.0',
              status: 400,
            },
          });
        }

        // UPSERT vote
        const existingIdx = db.votes.findIndex(
          (v) => v.participant_id === participant_id && v.team_id === team_id
        );

        let voteId = '';
        if (existingIdx >= 0) {
          db.votes[existingIdx].vocal_score = vocal_score;
          db.votes[existingIdx].performance_score = performance_score;
          voteId = db.votes[existingIdx].id;
        } else {
          voteId = 'vote_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          db.votes.push({
            id: voteId,
            participant_id,
            team_id,
            vocal_score,
            performance_score,
            created_at: new Date().toISOString(),
          });
        }

        db.version = (db.version || 1) + 1;
        saveDb(db);

        return sendJson(res, 200, { success: true, voteId });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: { message: err.message } });
      }
    }

    // 3. POST /api/upload-video (Binary streaming)
    if (req.method === 'POST' && pathname === '/api/upload-video') {
      try {
        const teamId = urlObj.searchParams.get('team_id');
        const rawFilename = urlObj.searchParams.get('filename') || 'video.mp4';
        const ext = path.extname(rawFilename) || '.mp4';
        const sanitizedExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
        const filename = `${teamId}_${Date.now()}${sanitizedExt}`;

        if (!fs.existsSync(VIDEO_DIR)) {
          fs.mkdirSync(VIDEO_DIR, { recursive: true });
        }

        const targetPath = path.join(VIDEO_DIR, filename);
        const writeStream = fs.createWriteStream(targetPath);

        req.pipe(writeStream);

        writeStream.on('finish', () => {
          const videoUrl = `/videos/teams/${filename}`;
          const targetTeam = db.teams.find((t) => t.id === teamId);
          if (targetTeam) {
            targetTeam.video_url = videoUrl;
            targetTeam.video_storage_path = `teams/${teamId}/${filename}`;
          }

          db.version = (db.version || 1) + 1;
          saveDb(db);

          return sendJson(res, 200, { success: true, video_url: videoUrl });
        });

        writeStream.on('error', (err) => {
          return sendJson(res, 500, { success: false, error: err.message });
        });
        return;
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 4. POST /api/create-team
    if (req.method === 'POST' && pathname === '/api/create-team') {
      try {
        const body = await parseJsonBody(req);
        const name = (body.name || '').trim();
        if (!name) {
          return sendJson(res, 400, { success: false, error: 'Tên đội thi không được để trống' });
        }

        const maxOrder = db.teams.reduce((max, t) => Math.max(max, t.performance_order || 0), 0);
        const order =
          typeof body.performance_order === 'number' && body.performance_order > 0
            ? body.performance_order
            : maxOrder + 1;

        const newId = `team-${Date.now()}`;
        const newTeam: TeamItem = {
          id: newId,
          name,
          performance_order: order,
          video_url: body.video_url || null,
          video_storage_path: null,
          teammate_bonus: 0,
          lucky_star: 0,
        };

        db.teams.push(newTeam);
        db.teams.sort(
          (a, b) => a.performance_order - b.performance_order || a.name.localeCompare(b.name)
        );

        db.version = (db.version || 1) + 1;
        saveDb(db);

        return sendJson(res, 200, { success: true, team: newTeam });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 5. POST /api/update-team
    if (req.method === 'POST' && pathname === '/api/update-team') {
      try {
        const body = await parseJsonBody(req);
        const { id, name, performance_order, teammate_bonus, lucky_star, video_url } = body;
        const targetTeam = db.teams.find((t) => t.id === id);

        if (targetTeam) {
          if (name !== undefined && typeof name === 'string' && name.trim()) {
            targetTeam.name = name.trim();
          }
          if (performance_order !== undefined && typeof performance_order === 'number') {
            targetTeam.performance_order = performance_order;
          }
          if (teammate_bonus !== undefined) targetTeam.teammate_bonus = teammate_bonus;
          if (lucky_star !== undefined) targetTeam.lucky_star = lucky_star;
          if (video_url !== undefined) targetTeam.video_url = video_url;

          db.teams.sort(
            (a, b) => a.performance_order - b.performance_order || a.name.localeCompare(b.name)
          );
          db.version = (db.version || 1) + 1;
          saveDb(db);
        }

        return sendJson(res, 200, { success: true, team: targetTeam });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 6. POST /api/delete-team
    if (req.method === 'POST' && pathname === '/api/delete-team') {
      try {
        const body = await parseJsonBody(req);
        const { id } = body;
        db.teams = db.teams.filter((t) => t.id !== id);
        db.votes = db.votes.filter((v) => v.team_id !== id);

        db.version = (db.version || 1) + 1;
        saveDb(db);

        return sendJson(res, 200, { success: true });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 5. POST /api/lock
    if (req.method === 'POST' && pathname === '/api/lock') {
      try {
        const body = await parseJsonBody(req);
        const { is_locked, reason, locked_by } = body;

        db.settings.is_locked = Boolean(is_locked);
        db.settings.locked_at = is_locked ? new Date().toISOString() : null;
        db.settings.locked_by = is_locked
          ? reason
            ? `${locked_by || 'admin'} (${reason})`
            : locked_by || 'admin'
          : null;
        db.settings.updated_at = new Date().toISOString();

        db.version = (db.version || 1) + 1;
        saveDb(db);

        return sendJson(res, 200, { success: true, settings: db.settings });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 6. POST /api/toggle-participant
    if (req.method === 'POST' && pathname === '/api/toggle-participant') {
      try {
        const body = await parseJsonBody(req);
        const { id, action } = body;

        if (action === 'deactivate_all') {
          db.participants.forEach((p) => (p.is_active = false));
        } else if (id) {
          const p = db.participants.find((item) => item.id === id);
          if (p) p.is_active = !p.is_active;
        }

        db.version = (db.version || 1) + 1;
        saveDb(db);

        return sendJson(res, 200, { success: true });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 7. POST /api/import-participants
    if (req.method === 'POST' && pathname === '/api/import-participants') {
      try {
        const body = await parseJsonBody(req);
        const rows: Array<{ name: string; department?: string; username?: string }> = body.rows || [];

        let created = 0;
        let skipped = 0;

        for (const row of rows) {
          const cleanName = (row.name || '').trim();
          if (!cleanName) {
            skipped++;
            continue;
          }

          const existing = db.participants.find(
            (p) =>
              p.name.toLowerCase() === cleanName.toLowerCase() &&
              (p.department || '').toLowerCase() === (row.department || '').toLowerCase()
          );

          if (existing) {
            skipped++;
          } else {
            const newId = `emp-${db.participants.length + 1}`;
            db.participants.push({
              id: newId,
              name: cleanName,
              department: row.department?.trim() || 'Chưa phân khoa',
              username: row.username || `nv${String(db.participants.length + 1).padStart(3, '0')}`,
              is_active: true,
            });
            created++;
          }
        }

        db.version = (db.version || 1) + 1;
        saveDb(db);

        return sendJson(res, 200, { success: true, created, skipped });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 8. POST /api/reset
    if (req.method === 'POST' && pathname === '/api/reset') {
      try {
        if (fs.existsSync(DB_PATH)) {
          fs.unlinkSync(DB_PATH);
        }
        memoryDb = null;
        loadDb();
        return sendJson(res, 200, { success: true });
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    return sendJson(res, 404, { error: 'Not found' });
  };

  return {
    name: 'local-central-server',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler);
    },
  };
}
