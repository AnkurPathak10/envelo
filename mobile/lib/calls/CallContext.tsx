import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Keyboard } from 'react-native';
import { AudioModule } from 'expo-audio';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth/AuthContext';
import { useSocket } from '@/lib/socket/SocketContext';
import { createDirectConversation } from '@/lib/api/conversations';
import {
  callSchema,
  credentialsSchema,
  incomingSchema,
  isTerminal,
  syncSchema,
  updateSchema,
  rosterSchema,
  type CallCredentials,
  type CallPerson,
  type CallRecord,
} from './contracts';
import { callingAvailable, createCallMedia } from './media';
import { emptyMedia, type CallMedia, type MediaState } from './mediaTypes';
import { stopChatAudio } from './audioOwnership';

export interface ActiveCall {
  conversationId: string;
  peer: CallPerson;
  record: CallRecord | null;
  incoming: boolean;
  phase: 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';
  notice?: string;
  participants?: CallPerson[];
  invitedUserIds?: string[];
  groupCall?: boolean;
  guest?: boolean;
  expiresAt?: string;
}
interface CallContextValue {
  active: ActiveCall | null;
  media: MediaState;
  minimized: boolean;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  available: boolean;
  start: (conversationId: string, peer: CallPerson) => Promise<void>;
  accept: () => Promise<void>;
  invite: (userId: string) => Promise<boolean>;
  end: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
  flipCamera: () => Promise<void>;
  minimize: () => void;
  restore: () => void;
  sendMessage: () => void;
  dismiss: (navigate?: boolean) => void;
  sync: () => Promise<void>;
}
const Context = createContext<CallContextValue | null>(null);
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Unable to complete this call action.';

export function CallProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { requestCall, subscribeToCalls, connectionEpoch, connectionState } =
    useSocket();
  const [active, setActive] = useState<ActiveCall | null>(null);
  const current = useRef(active);
  const [media, setMedia] = useState(emptyMedia);
  const [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);
  const accepting = useRef(false);
  const cancelled = useRef(false);
  const generation = useRef(0);
  const engine = useRef<CallMedia | null>(null);
  const mediaCleanup = useRef<Promise<void>>(Promise.resolve());
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const endRef = useRef<() => Promise<void>>(async () => undefined);
  const joining = useRef<string | null>(null);
  const put = useCallback((value: ActiveCall | null) => {
    current.current = value;
    setActive(value);
  }, []);
  const patch = useCallback(
    (value: Partial<ActiveCall>) => {
      if (current.current) put({ ...current.current, ...value });
    },
    [put]
  );
  const stopMedia = useCallback(async () => {
    const previous = engine.current;
    engine.current = null;
    joining.current = null;
    setMedia(emptyMedia);
    const leaving =
      previous?.leave().catch(() => undefined) ?? Promise.resolve();
    mediaCleanup.current = Promise.all([mediaCleanup.current, leaving]).then(
      () => undefined
    );
    await mediaCleanup.current;
  }, []);
  const finishLocal = useCallback(
    (notice: string, record?: CallRecord) => {
      generation.current++;
      operation.current = false;
      accepting.current = false;
      setBusy(false);
      patch({ phase: 'ended', notice, ...(record ? { record } : {}) });
      void stopMedia();
    },
    [patch, stopMedia]
  );
  const openChat = useCallback(async () => {
    const call = current.current;
    if (!call) return;
    // An invite into A/B's call does not grant access to A/B's chat. A guest
    // messages their own inviter instead, through the existing friend-gated API.
    let conversationId = call.conversationId;
    if (call.guest) {
      try {
        conversationId = (await createDirectConversation(call.peer.id)).id;
      } catch {
        setError('Unable to open a conversation with your inviter.');
        return;
      }
    }
    router.navigate({
      pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
      params: {
        conversationId,
        participantId: call.peer.id,
        participantName: call.peer.displayName,
        participantAvatarUrl: call.peer.avatarUrl ?? '',
        conversationType: 'DIRECT',
      },
    });
  }, []);
  const dismiss = useCallback(
    (navigate = true) => {
      if (current.current?.phase !== 'ended') return;
      if (navigate && !current.current.guest) void openChat();
      put(null);
      setError(null);
    },
    [openChat, put]
  );
  const join = useCallback(
    async (credentials: CallCredentials) => {
      if (joining.current === credentials.call.id || engine.current) return;
      joining.current = credentials.call.id;
      const version = generation.current;
      let next: CallMedia | undefined;
      try {
        await stopChatAudio();
        await mediaCleanup.current;
        if (version !== generation.current || cancelled.current) return;
        next = await createCallMedia(
          credentials.authToken,
          (state) => {
            if (version !== generation.current) return;
            setMedia(state);
            if (
              state.joined &&
              (state.remoteJoined || current.current?.groupCall) &&
              current.current?.record?.status === 'ONGOING'
            )
              patch({ phase: 'connected' });
          },
          () => {
            if (version === generation.current) void endRef.current();
          }
        );
        if (version !== generation.current || cancelled.current) {
          await next.leave();
          return;
        }
        engine.current = next;
        await next.join();
      } catch (e) {
        if (version !== generation.current) return;
        setError(message(e));
        await requestCall('call:end', { callId: credentials.call.id }).catch(
          () => undefined
        );
        if (version !== generation.current) return;
        finishLocal('Could not connect');
      }
    },
    [finishLocal, patch, requestCall]
  );
  const sync = useCallback(async () => {
    if (!user?.id || !callingAvailable) return;
    const version = generation.current;
    try {
      const result = syncSchema.parse(await requestCall('call:sync', {}));
      if (version !== generation.current) return;
      const local = current.current;
      if (!result.call) {
        if (local?.record && local.phase !== 'ended')
          finishLocal(
            local.record.status === 'RINGING'
              ? local.incoming
                ? 'Missed call'
                : 'No answer'
              : 'Call ended'
          );
        return;
      }
      if (isTerminal(result.call)) {
        if (local?.record?.id === result.call.id)
          finishLocal('Call ended', result.call);
        return;
      }
      if (local?.record?.id === result.call.id && local.phase !== 'ended') {
        if (
          local.incoming &&
          local.phase === 'ringing' &&
          !accepting.current &&
          !engine.current &&
          result.authToken
        ) {
          finishLocal('Answered on another device');
          return;
        }
        patch({
          record: result.call,
          notice: undefined,
          ...rosterSchema.parse(result),
        });
        if (
          result.call.status === 'ONGOING' &&
          (mediaRef.current.remoteJoined ||
            (result.groupCall && mediaRef.current.joined)) &&
          (!local.incoming || engine.current)
        )
          patch({ phase: 'connected' });
        // Recover a lost accept acknowledgement on this device only after an
        // explicit local accept attempt. Opening another device never joins it.
        if (accepting.current && !engine.current && result.authToken) {
          patch({ phase: 'connecting' });
          await join(credentialsSchema.parse(result));
        }
        return;
      }
      // Recover an invitation missed while reconnecting. Never steal a joined
      // call from another device merely because the app opened there.
      if (
        ((result.call.status === 'RINGING' &&
          result.call.initiatorId !== user.id) ||
          (result.expiresAt && !result.authToken)) &&
        result.caller &&
        (!local || local.phase === 'ended')
      ) {
        generation.current++;
        cancelled.current = false;
        setError(null);
        setMinimized(false);
        put({
          conversationId: result.call.conversationId,
          peer: result.caller,
          record: result.call,
          incoming: true,
          phase: 'ringing',
          ...rosterSchema.parse(result),
        });
      } else if (
        local?.phase === 'preparing' &&
        local.conversationId === result.call.conversationId &&
        result.authToken
      ) {
        const credentials = credentialsSchema.parse(result);
        patch({
          record: result.call,
          phase: result.call.status === 'RINGING' ? 'ringing' : 'connecting',
        });
        await join(credentials);
      }
    } catch {
      /* Socket/provider errors leave the ongoing media call intact. */
    }
  }, [finishLocal, join, patch, put, requestCall, user?.id]);
  const start = useCallback(
    async (conversationId: string, peer: CallPerson) => {
      if (current.current && current.current.phase !== 'ended') {
        setMinimized(false);
        return;
      }
      Keyboard.dismiss();
      if (!callingAvailable) {
        setError(
          'Install a new Envelo development build to use voice and video calls.'
        );
        return;
      }
      generation.current++;
      const version = generation.current;
      cancelled.current = false;
      operation.current = true;
      setBusy(true);
      setMinimized(false);
      setError(null);
      put({
        conversationId,
        peer,
        incoming: false,
        record: null,
        phase: 'preparing',
      });
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (version !== generation.current || cancelled.current) return;
        if (!permission.granted)
          throw new Error(
            'Microphone access is required. You can enable it in device settings.'
          );
        const result = credentialsSchema.parse(
          await requestCall('call:invite', { conversationId })
        );
        if (version !== generation.current || cancelled.current) {
          await requestCall('call:end', { callId: result.call.id });
          return;
        }
        patch({
          record: result.call,
          phase: 'ringing',
          ...rosterSchema.parse(result),
        });
        await join(result);
        if (version === generation.current && !cancelled.current) await sync();
      } catch (e) {
        if (version === generation.current) {
          setError(message(e));
          // A lost acknowledgement may still have created a ringing call.
          await sync();
          if (!current.current?.record) finishLocal('Unable to start call');
        }
      } finally {
        if (version === generation.current) {
          operation.current = false;
          setBusy(false);
        }
      }
    },
    [finishLocal, join, patch, put, requestCall, sync]
  );
  const accept = useCallback(async () => {
    const call = current.current;
    if (!call?.record || !call.incoming || operation.current) return;
    const version = generation.current;
    operation.current = true;
    accepting.current = true;
    setBusy(true);
    setError(null);
    patch({ phase: 'connecting' }); // Stops ringtone before microphone acquisition.
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (version !== generation.current) return;
      if (!permission.granted)
        throw new Error('Microphone access is required to accept the call.');
      const result = credentialsSchema.parse(
        await requestCall('call:accept', { callId: call.record.id })
      );
      if (version !== generation.current || cancelled.current) {
        await requestCall('call:end', { callId: result.call.id });
        return;
      }
      patch({
        record: result.call,
        phase: 'connecting',
        ...rosterSchema.parse(result),
      });
      await join(result);
    } catch (e) {
      if (version === generation.current) {
        setError(message(e));
        patch({ phase: 'ringing' });
        await sync();
      }
    } finally {
      if (version === generation.current) {
        accepting.current = false;
        operation.current = false;
        setBusy(false);
      }
    }
  }, [join, patch, requestCall, sync]);
  const end = useCallback(async () => {
    const call = current.current;
    if (!call || call.phase === 'ended') return;
    cancelled.current = true;
    await stopMedia();
    if (!call.record) {
      finishLocal('Call cancelled');
      return;
    }
    setBusy(true);
    try {
      const result = await requestCall(
        call.incoming && call.phase === 'ringing' && !accepting.current
          ? 'call:decline'
          : 'call:end',
        { callId: call.record.id }
      );
      const parsed = callSchema.safeParse((result as { call?: unknown }).call);
      if (
        current.current?.record?.id === call.record.id &&
        current.current.phase !== 'ended'
      )
        finishLocal('Call ended', parsed.success ? parsed.data : undefined);
    } catch {
      if (
        current.current?.record?.id !== call.record.id ||
        current.current.phase === 'ended'
      )
        return;
      setError('Audio has stopped. Reconnecting to finish the call…');
      // Retain the call identity so reconnect can retry the terminal action.
      patch({ phase: 'connecting' });
    } finally {
      if (current.current?.record?.id === call.record.id) setBusy(false);
    }
  }, [finishLocal, patch, requestCall, stopMedia]);
  endRef.current = end;
  const invite = useCallback(
    async (userId: string) => {
      const call = current.current;
      if (!call?.record || call.phase !== 'connected') return false;
      const version = generation.current;
      try {
        const result = updateSchema.parse(
          await requestCall('call:invite', { callId: call.record.id, userId })
        );
        if (version !== generation.current || cancelled.current) return false;
        patch(rosterSchema.parse(result));
        return true;
      } catch (e) {
        if (version === generation.current) setError(message(e));
        return false;
      }
    },
    [patch, requestCall]
  );
  const control = useCallback(
    async (action: (media: CallMedia) => Promise<void>) => {
      if (!engine.current || operation.current || cancelled.current) return;
      operation.current = true;
      const version = generation.current;
      setBusy(true);
      setError(null);
      try {
        await action(engine.current);
      } catch (e) {
        if (version === generation.current) setError(message(e));
      } finally {
        if (version === generation.current) {
          operation.current = false;
          setBusy(false);
        }
      }
    },
    []
  );

  useEffect(
    () =>
      subscribeToCalls((event, data) => {
        if (event === 'call:incoming') {
          const result = incomingSchema.safeParse(data);
          if (
            !result.success ||
            !callingAvailable ||
            Date.parse(result.data.expiresAt) <= Date.now()
          )
            return;
          if (current.current && current.current.phase !== 'ended') return;
          generation.current++;
          cancelled.current = false;
          setError(null);
          setMinimized(false);
          Keyboard.dismiss();
          put({
            record: result.data.call,
            peer: result.data.caller,
            conversationId: result.data.call.conversationId,
            phase: 'ringing',
            incoming: true,
            ...rosterSchema.parse(result.data),
          });
          return;
        }
        const update = updateSchema.safeParse(data);
        if (!update.success) return;
        const result = { success: true, data: update.data.call };
        if (
          current.current?.record?.id !== result.data.id ||
          current.current.phase === 'ended'
        )
          return;
        if (
          update.data.participantUserId === user?.id &&
          (update.data.invitationEnded || update.data.left)
        ) {
          finishLocal(
            update.data.invitationEnded
              ? 'Invitation ended'
              : 'You left the call',
            result.data
          );
          return;
        }
        if (isTerminal(result.data)) {
          finishLocal(
            result.data.status === 'MISSED'
              ? current.current.incoming
                ? 'Missed call'
                : 'No answer'
              : result.data.status === 'DECLINED'
                ? 'Call declined'
                : 'Call ended',
            result.data
          );
        } else if (event === 'call:accepted') {
          patch(rosterSchema.parse(update.data));
          if (
            current.current.incoming &&
            !accepting.current &&
            !engine.current &&
            (!update.data.participantUserId ||
              update.data.participantUserId === user?.id) &&
            result.data.status === 'ONGOING' &&
            (!update.data.participants ||
              update.data.participants.some((p) => p.id === user?.id))
          ) {
            finishLocal('Answered on another device');
            return;
          }
          patch({
            record: result.data,
            ...(result.data.status === 'ONGOING' &&
            (!current.current.incoming || engine.current || accepting.current)
              ? {
                  phase:
                    mediaRef.current.remoteJoined ||
                    (update.data.groupCall && mediaRef.current.joined)
                      ? 'connected'
                      : 'connecting',
                }
              : {}),
          });
        }
      }),
    [finishLocal, patch, put, subscribeToCalls, user?.id]
  );
  useEffect(() => {
    if (connectionState !== 'connected') return;
    if (
      cancelled.current &&
      current.current?.record &&
      current.current.phase !== 'ended'
    )
      void end();
    else void sync();
  }, [connectionEpoch, connectionState, end, sync]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => listener.remove();
  }, [sync]);
  const resetAccountCall = useCallback(() => {
    generation.current++;
    cancelled.current = true;
    void stopMedia();
    current.current = null;
    setActive(null);
    setError(null);
  }, [stopMedia]);
  useEffect(() => resetAccountCall, [resetAccountCall, user?.id]);
  useEffect(() => {
    if (active?.phase !== 'ended') return;
    const timer = setTimeout(() => {
      dismiss(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [active?.phase, dismiss]);
  // Permission prompts and signaling loss must not leave a stale invitation
  // ringing indefinitely; the authoritative result is fetched at its deadline.
  const ringingId = active?.record?.id;
  const ringingCreatedAt = active?.record?.createdAt;
  const ringingStatus = active?.record?.status;
  const invitationExpiresAt = active?.expiresAt;
  const phase = active?.phase;
  useEffect(() => {
    if (
      !ringingId ||
      !ringingCreatedAt ||
      (ringingStatus !== 'RINGING' &&
        !(active?.incoming && phase === 'ringing')) ||
      phase === 'ended'
    )
      return;
    const id = ringingId;
    const timer = setTimeout(
      () => {
        void sync();
        if (
          current.current?.record?.id === id &&
          (current.current.record.status === 'RINGING' ||
            current.current.phase === 'ringing')
        )
          patch({ notice: 'Checking call status…' });
      },
      Math.max(
        0,
        (invitationExpiresAt
          ? Date.parse(invitationExpiresAt) + 1000
          : Date.parse(ringingCreatedAt) + 46_000) - Date.now()
      )
    );
    return () => clearTimeout(timer);
  }, [
    ringingId,
    ringingCreatedAt,
    ringingStatus,
    invitationExpiresAt,
    active?.incoming,
    phase,
    patch,
    sync,
  ]);

  return (
    <Context.Provider
      value={{
        active,
        media,
        minimized,
        busy,
        error,
        available: callingAvailable,
        start,
        accept,
        invite,
        end,
        sync,
        dismiss,
        clearError: () => setError(null),
        minimize: () => setMinimized(true),
        restore: () => {
          Keyboard.dismiss();
          setMinimized(false);
        },
        sendMessage: () => {
          setMinimized(true);
          void openChat();
        },
        toggleMicrophone: () =>
          control((m) => m.microphone(!mediaRef.current.microphoneOn)),
        toggleCamera: () =>
          control(async (m) => {
            const enabled = !mediaRef.current.cameraOn;
            await m.camera(enabled);
            if (enabled && current.current?.record)
              await requestCall('call:video-enabled', {
                callId: current.current.record.id,
              });
          }),
        toggleSpeaker: () =>
          control((m) => m.speaker(!mediaRef.current.speakerOn)),
        flipCamera: () => control((m) => m.flip()),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCall() {
  const value = useContext(Context);
  if (!value) throw new Error('CallProvider is missing');
  return value;
}
