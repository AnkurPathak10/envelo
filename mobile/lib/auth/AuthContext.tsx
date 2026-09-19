import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { clearTokens, getTokens, saveTokens } from '@/lib/auth/storage';
import {
  clearCachedUser,
  getCachedUser,
  saveCachedUser,
} from '@/lib/auth/userStorage';

interface AuthContextValue {
  user: ApiUser | null;
  accessToken: string | null;
  isLoading: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authRevision = useRef(0);
  const authMutation = useRef(Promise.resolve());
  const serializeAuthMutation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const previous = authMutation.current;
      let release: () => void = () => undefined;
      authMutation.current = new Promise<void>((resolve) => {
        release = resolve;
      });

      return previous.then(operation, operation).finally(release);
    },
    []
  );
  const completeAuthentication = useCallback(
    async (response: AuthResponse) => {
      const authenticationRevision = ++authRevision.current;
      await serializeAuthMutation(async () => {
        await Promise.all([
          saveTokens(response),
          saveCachedUser(response.user),
        ]);
        if (authenticationRevision !== authRevision.current) return;
        setAccessToken(response.accessToken);
        setUser(response.user);
      });
    },
    [serializeAuthMutation]
  );
  const authenticateWithSignIn = useCallback(
    async (input: SignInInput) => completeAuthentication(await signIn(input)),
    [completeAuthentication]
  );
  const authenticateWithSignUp = useCallback(
    async (input: SignUpInput) => completeAuthentication(await signUp(input)),
    [completeAuthentication]
  );
  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const refreshRevision = authRevision.current;
    return serializeAuthMutation(async () => {
      const session = await refreshSession();
      if (refreshRevision !== authRevision.current) return null;
      if (!session) {
        setAccessToken(null);
        setUser(null);
        await clearCachedUser();
        return null;
      }

      await saveCachedUser(session.user);
      setAccessToken(session.accessToken);
      setUser(session.user);
      return session.accessToken;
    });
  }, [serializeAuthMutation]);
  const signOut = useCallback(async () => {
    authRevision.current += 1;
    setAccessToken(null);
    setUser(null);
    await serializeAuthMutation(async () => {
      try {
        await logout();
      } catch {
        /* Local logout still succeeds if the server is unavailable. */
      } finally {
        await Promise.all([clearTokens(), clearCachedUser()]);
      }
    });
  }, [serializeAuthMutation]);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      authRevision.current += 1;
      setAccessToken(null);
      setUser(null);
      void clearCachedUser();
    });
    const initialRevision = authRevision.current;
    void serializeAuthMutation(async () => {
      const [tokens, cachedUser] = await Promise.all([
        getTokens(),
        getCachedUser(),
      ]);
      if (initialRevision !== authRevision.current) return;

      if (tokens && cachedUser) {
        setAccessToken(tokens.accessToken);
        setUser(cachedUser);
        setIsLoading(false);
      } else if (!tokens) {
        await clearCachedUser();
      }

      try {
        const session = await refreshSession();
        if (initialRevision !== authRevision.current) return;
        if (!session) {
          await clearCachedUser();
          setAccessToken(null);
          setUser(null);
          return;
        }

        await saveCachedUser(session.user);
        setAccessToken(session.accessToken);
        setUser(session.user);
      } catch {
        // Keep the locally restored session during a cold offline start.
        if (!tokens || !cachedUser) {
          setAccessToken(null);
          setUser(null);
        }
      }
    }).finally(() => setIsLoading(false));
    return () => setSessionExpiredHandler(undefined);
  }, [serializeAuthMutation]);
  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      signIn: authenticateWithSignIn,
      signUp: authenticateWithSignUp,
      signOut,
      refreshAccessToken,
    }),
    [
      accessToken,
      authenticateWithSignIn,
      authenticateWithSignUp,
      isLoading,
      refreshAccessToken,
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
