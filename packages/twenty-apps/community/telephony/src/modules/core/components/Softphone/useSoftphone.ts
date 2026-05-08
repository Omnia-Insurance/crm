import { useCallback, useEffect, useRef, useState } from 'react';
import { Call, Device } from '@twilio/voice-sdk';

import { useCurrentWorkspaceMemberId } from 'src/modules/core/components/Softphone/useCurrentWorkspaceMemberId';

// Owns the Twilio Voice Device lifecycle for the active workspaceMember:
//   - fetches a short-lived AccessToken from /twilio/access-token
//   - creates the Device, registers it (unlocks `<Dial><Client>{id}</Client>` inbound)
//   - exposes call state + actions (place / accept / reject / hangup / mute)
//   - refreshes the token on the SDK's `tokenWillExpire` event
//
// The Device is destroyed on unmount to release the WebRTC signaling channel.

export type SoftphoneStatus =
  | 'initializing'
  | 'ready'
  | 'unavailable'
  | 'error';

export type CallState =
  | { kind: 'idle' }
  | { kind: 'dialing'; to: string }
  | { kind: 'ringing-out'; to: string; call: Call }
  | { kind: 'ringing-in'; from: string; call: Call }
  | { kind: 'in-progress'; counterparty: string; call: Call; muted: boolean };

interface AccessTokenResponse {
  providerId: string;
  token: string;
  expiresAt: string;
}

const ACCESS_TOKEN_ENDPOINT = '/twilio/access-token';

// Coordinates with the upstream `useDialFromPhoneField` hook (twenty-front).
// When the cell action fires before the softphone is mounted, the dial
// intent is parked here; we pick it up the moment the Device reaches ready.
const PENDING_DIAL_STORAGE_KEY = '__omnia_telephony_pending_dial';
const PENDING_DIAL_MAX_AGE_MS = 30_000;

export function useSoftphone() {
  const memberId = useCurrentWorkspaceMemberId();
  const [status, setStatus] = useState<SoftphoneStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>({ kind: 'idle' });

  const deviceRef = useRef<Device | null>(null);

  // ── token + device bootstrap ───────────────────────────────────────

  const fetchToken = useCallback(async (): Promise<string | null> => {
    if (!memberId) return null;
    const res = await fetch(ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ memberId }),
    });
    if (!res.ok) {
      throw new Error(`access-token endpoint returned ${res.status}`);
    }
    const json = (await res.json()) as AccessTokenResponse;
    return json.token;
  }, [memberId]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const token = await fetchToken();
        if (!token) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        if (cancelled) return;

        const device = new Device(token, {
          logLevel: 'warn',
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        });

        device.on('registered', () => setStatus('ready'));
        device.on('unregistered', () => setStatus('unavailable'));
        device.on('error', (err: Error) => {
          setStatus('error');
          setError(err.message);
        });
        device.on('incoming', (call: Call) => {
          attachCallListeners(call, setCallState);
          setCallState({ kind: 'ringing-in', from: call.parameters.From ?? '', call });
        });
        device.on('tokenWillExpire', async () => {
          try {
            const refreshed = await fetchToken();
            if (refreshed) await device.updateToken(refreshed);
          } catch (e) {
            console.error('[softphone] token refresh failed', e);
          }
        });

        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        deviceRef.current = device;
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(e instanceof Error ? e.message : 'Unknown softphone error');
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      const device = deviceRef.current;
      if (device) {
        device.disconnectAll();
        device.destroy();
        deviceRef.current = null;
      }
    };
  }, [fetchToken]);

  // ── actions ────────────────────────────────────────────────────────

  const placeCall = useCallback(
    async (to: string) => {
      const device = deviceRef.current;
      if (!device || status !== 'ready') return;
      setCallState({ kind: 'dialing', to });
      try {
        const call = await device.connect({ params: { To: to } });
        attachCallListeners(call, setCallState);
        setCallState({ kind: 'ringing-out', to, call });
      } catch (e) {
        setCallState({ kind: 'idle' });
        setError(e instanceof Error ? e.message : 'Failed to place call');
      }
    },
    [status],
  );

  // Click-to-call from upstream cell actions:
  //   - direct path: the `telephony:dial` window event triggers a call when
  //     the softphone is already mounted and idle
  //   - delayed path: when the panel was closed at click time, the cell
  //     action also writes the dial intent to localStorage; we pick it up
  //     the moment the Device reaches `ready` and the user is idle
  //
  // Both paths are guarded so an agent mid-call isn't clobbered.
  useEffect(() => {
    const consumeAndDial = (number: string) => {
      void placeCall(number);
      try {
        window.localStorage.removeItem(PENDING_DIAL_STORAGE_KEY);
      } catch {
        // private browsing / quota — ignore
      }
    };

    const onDial = (e: Event) => {
      const detail = (e as CustomEvent<{ phoneNumber?: string }>).detail;
      const number = detail?.phoneNumber;
      if (!number) return;
      if (status !== 'ready') return;
      if (callState.kind !== 'idle') return;
      consumeAndDial(number);
    };
    window.addEventListener('telephony:dial', onDial);

    if (status === 'ready' && callState.kind === 'idle') {
      try {
        const raw = window.localStorage.getItem(PENDING_DIAL_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            phoneNumber?: string;
            ts?: number;
          };
          if (
            parsed.phoneNumber &&
            typeof parsed.ts === 'number' &&
            Date.now() - parsed.ts < PENDING_DIAL_MAX_AGE_MS
          ) {
            consumeAndDial(parsed.phoneNumber);
          } else {
            // Stale entry — clean up so it doesn't fire later.
            window.localStorage.removeItem(PENDING_DIAL_STORAGE_KEY);
          }
        }
      } catch {
        // localStorage / JSON parsing error — silently skip
      }
    }

    return () => window.removeEventListener('telephony:dial', onDial);
  }, [status, callState.kind, placeCall]);

  const acceptIncoming = useCallback(() => {
    if (callState.kind !== 'ringing-in') return;
    callState.call.accept();
  }, [callState]);

  const rejectIncoming = useCallback(() => {
    if (callState.kind !== 'ringing-in') return;
    callState.call.reject();
    setCallState({ kind: 'idle' });
  }, [callState]);

  const hangup = useCallback(() => {
    const device = deviceRef.current;
    device?.disconnectAll();
    setCallState({ kind: 'idle' });
  }, []);

  const setMuted = useCallback(
    (muted: boolean) => {
      if (callState.kind !== 'in-progress') return;
      callState.call.mute(muted);
      setCallState({ ...callState, muted });
    },
    [callState],
  );

  return {
    status,
    error,
    callState,
    placeCall,
    acceptIncoming,
    rejectIncoming,
    hangup,
    setMuted,
  };
}

function attachCallListeners(
  call: Call,
  setCallState: (s: CallState) => void,
) {
  call.on('accept', () => {
    const counterparty = call.parameters.From ?? call.customParameters.get('To') ?? '';
    setCallState({ kind: 'in-progress', counterparty, call, muted: false });
  });
  call.on('disconnect', () => {
    setCallState({ kind: 'idle' });
  });
  call.on('cancel', () => setCallState({ kind: 'idle' }));
  call.on('reject', () => setCallState({ kind: 'idle' }));
  call.on('error', () => setCallState({ kind: 'idle' }));
}
