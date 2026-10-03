// Await chat recorder/player cleanup before RealtimeKit configures the shared
// native audio session. In particular, a recorder must not reset it mid-call.
const interruptions = new Set<() => Promise<void>>();
export function registerChatAudio(stop: () => Promise<void>) {
  interruptions.add(stop);
  return () => {
    interruptions.delete(stop);
  };
}
export async function stopChatAudio() {
  await Promise.all([...interruptions].map((stop) => stop()));
}
