import { fetchIsAdmin } from '../fetchIsAdmin';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('fetchIsAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupSupabaseFromMock = ({
    userIdData = null,
    idData = null,
    emailData = null,
    errorObj = null,
  }: any) => {
    const mockMaybeSingle = jest.fn().mockImplementation(function (this: any) {
      if (this.currentFilter === 'user_id') return { data: userIdData, error: errorObj };
      if (this.currentFilter === 'id') return { data: idData, error: errorObj };
      if (this.currentFilter === 'email') return { data: emailData, error: errorObj };
      return { data: null, error: null };
    });

    const mockEq = jest.fn().mockImplementation(function (this: any, col) {
      this.currentFilter = col;
      return { maybeSingle: mockMaybeSingle.bind(this) };
    });

    const mockIlike = jest.fn().mockImplementation(function (this: any, col) {
      this.currentFilter = col;
      return { maybeSingle: mockMaybeSingle.bind(this) };
    });

    const mockSelect = jest.fn().mockReturnValue({
      eq: mockEq,
      ilike: mockIlike,
    });

    (supabase.from as jest.Mock).mockReturnValue({
      select: mockSelect,
    });
  };

  it('returns false immediately if userId is undefined', async () => {
    const res = await fetchIsAdmin(undefined);
    expect(res).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('uses RPC call successfully', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: true, error: null });

    const res = await fetchIsAdmin('user1');
    expect(res).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('get_my_admin_status');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('falls back to user_id query if RPC fails or returns non-boolean', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('RPC Error') });
    setupSupabaseFromMock({ userIdData: { isadmin: true } });

    const res = await fetchIsAdmin('user1');
    expect(res).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('users');
  });

  it('falls back to id query if user_id query fails', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('RPC Error') });
    
    // user_id fails, id succeeds
    setupSupabaseFromMock({ 
      userIdData: null,
      idData: { is_admin: 1 } 
    });

    const res = await fetchIsAdmin('user1');
    expect(res).toBe(true);
  });

  it('falls back to email query if user queries return nothing', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('RPC Error') });
    setupSupabaseFromMock({
      userIdData: null,
      idData: null,
      emailData: { isAdmin: 'true' }
    });

    const res = await fetchIsAdmin('user1', 'test@test.com');
    expect(res).toBe(true);
  });

  it('returns false if all checks fail', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('RPC Error') });
    setupSupabaseFromMock({
      userIdData: null,
      idData: null,
      emailData: null
    });

    const res = await fetchIsAdmin('user1', 'test@test.com');
    expect(res).toBe(false);
  });

  it('correctly reads various admin truthy values', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('RPC Error') });
    
    setupSupabaseFromMock({ userIdData: { isAdmin: true } });
    expect(await fetchIsAdmin('user1')).toBe(true);

    setupSupabaseFromMock({ userIdData: { isadmin: 'true' } });
    expect(await fetchIsAdmin('user1')).toBe(true);

    setupSupabaseFromMock({ userIdData: { is_admin: 1 } });
    expect(await fetchIsAdmin('user1')).toBe(true);

    setupSupabaseFromMock({ userIdData: { isAdmin: false } });
    expect(await fetchIsAdmin('user1')).toBe(false);

    setupSupabaseFromMock({ userIdData: { isadmin: null } });
    expect(await fetchIsAdmin('user1')).toBe(false);
  });
});
