import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isMockMode, normalizeParticipantId } from '../lib/supabase';
import { mockStore } from '../lib/mockData';
import { Participant } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  participant: Participant | null;
  role: 'admin' | 'participant' | 'guest';
  isLoading: boolean;
  isMockMode: boolean;
  loginAdmin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginParticipant: (username: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  loginByParticipant: (participant: Participant) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshParticipant: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [role, setRole] = useState<'admin' | 'participant' | 'guest'>('guest');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load participant profile from auth_user_id (Real Supabase)
  const fetchParticipantProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('id, username, name, is_active')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching participant profile:', error);
        return null;
      }

      if (data) {
        setParticipant(data as Participant);
        setRole('participant');
        return data as Participant;
      } else {
        setParticipant(null);
        setRole('admin');
        return null;
      }
    } catch (err) {
      console.error('Exception fetching participant profile:', err);
      return null;
    }
  };

  useEffect(() => {
    if (isMockMode) {
      // Load saved mock state
      const savedRole = localStorage.getItem('mock_role') as 'admin' | 'participant' | null;
      if (savedRole === 'admin') {
        setUser({ id: 'admin-id', email: 'admin@hoithihat.com' } as User);
        setRole('admin');
      } else if (savedRole === 'participant') {
        const savedPartId = localStorage.getItem('mock_participant_id');
        const p = mockStore.getParticipants().find((item) => item.id === savedPartId);
        if (p) {
          setParticipant(p);
          setUser({ id: p.id, email: `${p.username}@hoithihat.local` } as User);
          setRole('participant');
        } else {
          setRole('guest');
        }
      } else {
        setRole('guest');
      }
      setIsLoading(false);
      return;
    }

    // Real Supabase Session Check
    const savedAdmin = localStorage.getItem('chamthi_admin_session');
    if (savedAdmin === 'true') {
      setUser({ id: 'admin-id', email: 'admin@hoithihat.com' } as User);
      setRole('admin');
      setIsLoading(false);
      return;
    }

    const savedParticipantStr = localStorage.getItem('chamthi_participant_session');
    if (savedParticipantStr) {
      try {
        const parsed = JSON.parse(savedParticipantStr);
        if (parsed && parsed.id) {
          parsed.id = normalizeParticipantId(parsed.id);
          localStorage.setItem('chamthi_participant_session', JSON.stringify(parsed));
          localStorage.setItem('mock_participant_id', parsed.id);
          setParticipant(parsed);
          setUser({ id: parsed.id, email: `${parsed.username || 'user'}@hoithihat.local` } as User);
          setRole('participant');
          setIsLoading(false);
          return;
        }
      } catch (e) {
        localStorage.removeItem('chamthi_participant_session');
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchParticipantProfile(session.user.id).finally(() => setIsLoading(false));
      } else {
        setRole('guest');
        setIsLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchParticipantProfile(session.user.id);
      } else {
        setParticipant(null);
        setRole('guest');
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginAdmin = async (email: string, password: string) => {
    try {
      setIsLoading(true);

      // Validate admin password
      if (password === '855986') {
        localStorage.setItem('chamthi_admin_session', 'true');
        setUser({ id: 'admin-id', email: email.trim() || 'admin@hoithihat.com' } as User);
        setRole('admin');
        return { success: true };
      }

      if (isMockMode) {
        return { success: false, error: 'Mật khẩu Admin không chính xác' };
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      localStorage.setItem('chamthi_admin_session', 'true');
      setRole('admin');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi đăng nhập admin' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginParticipant = async (username: string, password = '123') => {
    try {
      setIsLoading(true);
      const cleanUsername = username.trim().toLowerCase();

      if (isMockMode) {
        // Mock Participant Login
        const found = mockStore.getParticipants().find((p) => p.username.toLowerCase() === cleanUsername);
        if (!found) {
          return { success: false, error: `Không tìm thấy tài khoản "${username}". Hãy thử "user001" hoặc import file Excel.` };
        }
        if (!found.is_active) {
          return { success: false, error: 'Tài khoản đã bị vô hiệu hóa bởi Admin' };
        }
        if (password !== '123' && password !== '') {
          return { success: false, error: 'Mật khẩu mặc định là 123' };
        }

        localStorage.setItem('mock_role', 'participant');
        localStorage.setItem('mock_participant_id', found.id);
        setParticipant(found);
        setUser({ id: found.id, email: `${found.username}@hoithihat.local` } as User);
        setRole('participant');
        return { success: true };
      }

      // 1. Edge Function
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('participant-login', {
        body: { username: cleanUsername, password },
      });

      if (!edgeError && edgeData?.session) {
        await supabase.auth.setSession(edgeData.session);
        return { success: true };
      }

      if (edgeData?.error) {
        return { success: false, error: edgeData.error.message || 'Đăng nhập không thành công' };
      }

      // 2. Direct Fallback
      const internalDomain = import.meta.env.VITE_AUTH_INTERNAL_DOMAIN || 'hoithihat.local';
      const mappedEmail = `${cleanUsername}@${internalDomain}`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: mappedEmail,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          return { success: false, error: 'Tên đăng nhập hoặc mật khẩu không chính xác' };
        }
        return { success: false, error: authError.message };
      }

      if (authData.user) {
        const part = await fetchParticipantProfile(authData.user.id);
        if (part && !part.is_active) {
          await supabase.auth.signOut();
          return { success: false, error: 'Tài khoản đã bị vô hiệu hóa' };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi đăng nhập người tham gia' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginByParticipant = async (selected: Participant) => {
    try {
      setIsLoading(true);
      if (!selected.is_active) {
        return { success: false, error: 'Tài khoản nhân viên này đã bị vô hiệu hóa' };
      }

      const normalized: Participant = {
        ...selected,
        id: normalizeParticipantId(selected.id) || selected.id,
      };

      // Zero-password participant login: persists session in localStorage
      localStorage.setItem('chamthi_participant_session', JSON.stringify(normalized));
      localStorage.setItem('mock_participant_id', normalized.id);
      localStorage.setItem('mock_role', 'participant');
      setParticipant(normalized);
      setUser({ id: normalized.id, email: `${normalized.username || 'user'}@hoithihat.local` } as User);
      setRole('participant');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Lỗi đăng nhập' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    localStorage.removeItem('chamthi_admin_session');
    localStorage.removeItem('chamthi_participant_session');
    localStorage.removeItem('mock_role');
    localStorage.removeItem('mock_participant_id');

    if (!isMockMode) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        // ignore signout errors
      }
    }

    setUser(null);
    setSession(null);
    setParticipant(null);
    setRole('guest');
    setIsLoading(false);
  };

  const refreshParticipant = async () => {
    if (isMockMode) {
      const savedPartId = localStorage.getItem('mock_participant_id');
      const p = mockStore.getParticipants().find((item) => item.id === savedPartId);
      if (p) setParticipant(p);
      return;
    }

    if (user) {
      await fetchParticipantProfile(user.id);
    }
  };

  const value = useMemo(
    () => ({
      user,
      session,
      participant,
      role,
      isLoading,
      isMockMode,
      loginAdmin,
      loginParticipant,
      loginByParticipant,
      logout,
      refreshParticipant,
    }),
    [user, session, participant, role, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
