import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { type ApiUser, setSessionExpiredHandler } from '@/lib/api/client';
import {
  logout,
  refreshSession,
  signIn,
  signUp,
  type AuthResponse,
  type SignInInput,
  type SignUpInput,
} from '@/lib/api/auth';
import { clearTokens, saveTokens } from '@/lib/auth/storage';

interface AuthContextValue {
  user: ApiUser | null;
  accessToken: string | null;
  isLoading: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
    void (async () => {
      try {
        const session = await refreshSession();
        setAccessToken(session?.accessToken ?? null);
        setUser(session?.user ?? null);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => setSessionExpiredHandler(undefined);
  }, []);
  const completeAuthentication = useCallback(async (response: AuthResponse) => {
    await saveTokens(response);
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);
  const authenticateWithSignIn = useCallback(
    async (input: SignInInput) => completeAuthentication(await signIn(input)),
    [completeAuthentication]
  );
  const authenticateWithSignUp = useCallback(
    async (input: SignUpInput) => completeAuthentication(await signUp(input)),
    [completeAuthentication]
  );
  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      /* Local logout still succeeds if the server is unavailable. */
    } finally {
      await clearTokens();
      setAccessToken(null);
      setUser(null);
    }
  }, []);
  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      signIn: authenticateWithSignIn,
      signUp: authenticateWithSignUp,
      signOut,
    }),
    [
      accessToken,
      authenticateWithSignIn,
      authenticateWithSignUp,
      isLoading,
      signOut,
      user,
    ]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
