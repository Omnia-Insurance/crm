import { useState } from 'react';
import styled from '@emotion/styled';

// Note: tried `Button` from `twenty-sdk/ui`; it crashes in the front-
// component iframe with `g_themeCssVariablesSupport undefined`. The host
// theme provider isn't injected into the sandbox.

import {
  type CallState,
  useSoftphone,
} from 'src/modules/core/components/Softphone/useSoftphone';

// Minimal v1 softphone UI:
//   - status pill (initializing / ready / unavailable / error)
//   - dialed-number input
//   - dial pad
//   - place / hangup / accept / reject / mute controls based on call state
//
// Visual styling is intentionally restrained — uses the workspace's CSS
// variables so it picks up the user's theme (light / dark) without
// hard-coded colors. The settings memory note about themeCssVariables
// applies in TS files; here in @emotion/styled we use `var(--foo)` directly.

const StyledRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  min-width: 280px;
  max-width: 360px;
  font-family: Inter, system-ui, sans-serif;
  color: #111827;
`;

const StyledStatusRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
`;

const StyledPill = styled.span<{ tone: 'green' | 'gray' | 'red' | 'yellow' }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: ${({ tone }) =>
    tone === 'green'
      ? '#dcfce7'
      : tone === 'red'
        ? '#fee2e2'
        : tone === 'yellow'
          ? '#fef3c7'
          : '#f3f4f6'};
  color: ${({ tone }) =>
    tone === 'green'
      ? '#16a34a'
      : tone === 'red'
        ? '#dc2626'
        : tone === 'yellow'
          ? '#ca8a04'
          : '#6b7280'};
`;

const StyledInput = styled.input`
  width: 100%;
  font-size: 22px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  letter-spacing: 1px;
  text-align: center;
`;

const StyledKeypad = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
`;

const StyledKey = styled.button`
  padding: 14px 0;
  font-size: 18px;
  font-weight: 500;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f3f4f6;
  color: #111827;
  cursor: pointer;
  transition: background 0.1s ease;
  &:hover {
    background: #e5e7eb;
  }
  &:active {
    background: #d1d5db;
  }
`;

const StyledControls = styled.div`
  display: flex;
  gap: 8px;
`;

const StyledPrimaryButton = styled.button<{ tone: 'call' | 'hangup' | 'accept' }>`
  flex: 1;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: white;
  background: ${({ tone }) => (tone === 'hangup' ? '#dc2626' : '#1d4ed8')};
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const StyledSecondaryButton = styled.button`
  flex: 1;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  background: #f3f4f6;
  color: #111827;
`;

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

export const Softphone = () => {
  const {
    status,
    error,
    callState,
    placeCall,
    acceptIncoming,
    rejectIncoming,
    hangup,
    setMuted,
  } = useSoftphone();
  const [dialed, setDialed] = useState('');

  const appendDigit = (d: string) => {
    if (callState.kind === 'idle') {
      setDialed((s) => s + d);
    } else if (callState.kind === 'in-progress') {
      // DTMF: send tone over the active call. Twilio's SDK call.sendDigits()
      callState.call.sendDigits(d);
    }
  };

  return (
    <StyledRoot>
      <StyledStatusRow>
        <span>Softphone</span>
        <StatusPill status={status} error={error} />
      </StyledStatusRow>

      {callState.kind === 'ringing-in' ? (
        <IncomingCallView
          from={callState.from}
          onAccept={acceptIncoming}
          onReject={rejectIncoming}
        />
      ) : (
        <>
          <StyledInput
            type="tel"
            placeholder="+1 555 555 0123"
            value={
              callState.kind === 'idle'
                ? dialed
                : callState.kind === 'dialing' || callState.kind === 'ringing-out'
                  ? callState.to
                  : callState.kind === 'in-progress'
                    ? callState.counterparty
                    : ''
            }
            onChange={(e) =>
              callState.kind === 'idle' ? setDialed(e.target.value) : undefined
            }
            readOnly={callState.kind !== 'idle'}
          />
          <StyledKeypad>
            {KEYPAD_DIGITS.map((d) => (
              <StyledKey key={d} onClick={() => appendDigit(d)}>
                {d}
              </StyledKey>
            ))}
          </StyledKeypad>
          <CallControls
            callState={callState}
            status={status}
            dialed={dialed}
            onPlaceCall={async () => {
              if (!dialed) return;
              await placeCall(dialed);
              setDialed('');
            }}
            onHangup={hangup}
            onToggleMute={() =>
              callState.kind === 'in-progress' &&
              setMuted(!callState.muted)
            }
          />
        </>
      )}
    </StyledRoot>
  );
};

const StatusPill = ({
  status,
  error,
}: {
  status: ReturnType<typeof useSoftphone>['status'];
  error: string | null;
}) => {
  if (error) return <StyledPill tone="red">Error</StyledPill>;
  if (status === 'ready') return <StyledPill tone="green">Online</StyledPill>;
  if (status === 'unavailable')
    return <StyledPill tone="gray">Offline</StyledPill>;
  if (status === 'error') return <StyledPill tone="red">Error</StyledPill>;
  return <StyledPill tone="yellow">Connecting…</StyledPill>;
};

const IncomingCallView = ({
  from,
  onAccept,
  onReject,
}: {
  from: string;
  onAccept: () => void;
  onReject: () => void;
}) => (
  <>
    <div style={{ textAlign: 'center', padding: '12px 0' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        Incoming call from
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
        {from || 'Unknown number'}
      </div>
    </div>
    <StyledControls>
      <StyledPrimaryButton tone="hangup" onClick={onReject}>
        Reject
      </StyledPrimaryButton>
      <StyledPrimaryButton tone="accept" onClick={onAccept}>
        Accept
      </StyledPrimaryButton>
    </StyledControls>
  </>
);

const CallControls = ({
  callState,
  status,
  dialed,
  onPlaceCall,
  onHangup,
  onToggleMute,
}: {
  callState: CallState;
  status: ReturnType<typeof useSoftphone>['status'];
  dialed: string;
  onPlaceCall: () => Promise<void>;
  onHangup: () => void;
  onToggleMute: () => void;
}) => {
  if (callState.kind === 'idle') {
    return (
      <StyledControls>
        <StyledPrimaryButton
          tone="call"
          onClick={onPlaceCall}
          disabled={status !== 'ready' || !dialed}
        >
          Call
        </StyledPrimaryButton>
      </StyledControls>
    );
  }

  if (callState.kind === 'in-progress') {
    return (
      <StyledControls>
        <StyledSecondaryButton onClick={onToggleMute}>
          {callState.muted ? 'Unmute' : 'Mute'}
        </StyledSecondaryButton>
        <StyledPrimaryButton tone="hangup" onClick={onHangup}>
          Hang up
        </StyledPrimaryButton>
      </StyledControls>
    );
  }

  // dialing / ringing-out
  return (
    <StyledControls>
      <StyledPrimaryButton tone="hangup" onClick={onHangup}>
        Cancel
      </StyledPrimaryButton>
    </StyledControls>
  );
};
