import { useEffect } from 'react';
import { io } from 'socket.io-client';

export function useTemporarySocketTest(accessToken: string | null): void {
  useEffect(() => {
    const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
    if (!socketUrl || !accessToken) return;

    // TEMPORARY — Feature 04 connection verification. Feature 07 will replace this hook.
    const socket = io(socketUrl, { auth: { token: accessToken } });
    socket.on('connect', () => console.log('Socket test connected.'));
    socket.on('connect_error', (error: Error) =>
      console.log(`Socket test connection failed: ${error.message}`)
    );

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);
}
