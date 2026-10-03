import type { CallMedia, MediaState } from './mediaTypes';
export const callingAvailable = false;
export async function createCallMedia(
  _token: string,
  _update: (state: MediaState) => void,
  _left: () => void
): Promise<CallMedia> {
  throw new Error(
    'Calling is available in the Android and iOS development builds.'
  );
}
