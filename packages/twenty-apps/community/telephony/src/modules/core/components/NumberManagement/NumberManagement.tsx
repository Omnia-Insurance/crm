import { useState } from 'react';
import styled from '@emotion/styled';

import {
  callRoute,
  memberLabel,
  type MemberRow,
  type PhoneNumberRow,
  useNumberManagement,
} from 'src/modules/core/components/NumberManagement/useNumberManagement';

// Note: tried `Button` from `twenty-sdk/ui` and it crashes in the
// front-component iframe with `undefined is not an object (evaluating
// 'g_themeCssVariablesSupport')` — the component depends on a host theme
// provider that isn't injected into the sandbox. The hand-rolled buttons
// below render reliably; swap to the SDK Button only when the SDK ships a
// theme bridge.
type ButtonTone = 'primary' | 'danger' | 'secondary';
const StyledButton = styled.button<{ tone?: ButtonTone; size?: 'small' | 'medium' }>`
  padding: ${({ size }) => (size === 'small' ? '4px 8px' : '6px 10px')};
  font-size: ${({ size }) => (size === 'small' ? '11px' : '12px')};
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  background: ${({ tone }) =>
    tone === 'primary'
      ? '#1d4ed8'
      : tone === 'danger'
        ? '#dc2626'
        : '#f3f4f6'};
  color: ${({ tone }) =>
    tone === 'primary' || tone === 'danger' ? 'white' : '#111827'};
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// CSO settings UI for the Telephony app.
//
// Three flows:
//   1. List existing phone numbers + their current assignment, with
//      Reassign / Release actions inline.
//   2. Buy a new number — search by area code, pick from results, optionally
//      assign to an agent at purchase time.
//   3. Assign / reassign — pick a workspaceMember from the dropdown.
//
// All mutations go through the app's logic-function endpoints (`/numbers/*`)
// so business rules (soft-delete history, channel provisioning, provider
// release) stay enforced server-side.

const StyledRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  font-family: Inter, system-ui, sans-serif;
  color: #111827;
`;

const StyledHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const StyledHeading = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
`;

const StyledRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
`;

const StyledRowMain = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const StyledRowMeta = styled.div`
  font-size: 11px;
  color: #6b7280;
`;

const StyledControls = styled.div`
  display: flex;
  gap: 6px;
`;


const StyledInput = styled.input`
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
`;

const StyledSelect = styled.select`
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #111827;
`;

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #f3f4f6;
  border-radius: 6px;
`;

export const NumberManagement = () => {
  const { numbers, members, loading, error, refresh } = useNumberManagement();
  const [showBuy, setShowBuy] = useState(false);

  if (loading) return <StyledRoot>Loading…</StyledRoot>;
  if (error) return <StyledRoot>Failed to load: {error}</StyledRoot>;

  return (
    <StyledRoot>
      <StyledHeader>
        <StyledHeading>Telephony numbers</StyledHeading>
        <StyledButton tone="primary" onClick={() => setShowBuy(true)}>
          Buy a number
        </StyledButton>
      </StyledHeader>

      {showBuy && (
        <BuyWizard
          members={members}
          onCancel={() => setShowBuy(false)}
          onPurchased={async () => {
            setShowBuy(false);
            await refresh();
          }}
        />
      )}

      {numbers.length === 0 && !showBuy ? (
        <div style={{ color: '#6b7280' }}>
          No numbers yet. Click "Buy a number" to get started.
        </div>
      ) : (
        numbers.map((n) => (
          <NumberRow
            key={n.id}
            number={n}
            members={members}
            onChanged={refresh}
          />
        ))
      )}
    </StyledRoot>
  );
};

const NumberRow = ({
  number,
  members,
  onChanged,
}: {
  number: PhoneNumberRow;
  members: MemberRow[];
  onChanged: () => Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickedMemberId, setPickedMemberId] = useState<string>('');

  const assignedMember = members.find(
    (m) => m.id === number.activeAssignment?.workspaceMemberId,
  );

  const onReassign = async () => {
    if (!pickedMemberId) return;
    setBusy(true);
    try {
      await callRoute('/numbers/assign', {
        phoneNumberId: number.id,
        workspaceMemberId: pickedMemberId,
        replaceExisting: true,
        isDefault: true,
      });
      setEditing(false);
      setPickedMemberId('');
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const onRelease = async () => {
    if (
      !window.confirm(
        `Release ${number.e164}? This deletes it at the provider — calls/SMS history is kept.`,
      )
    )
      return;
    setBusy(true);
    try {
      await callRoute('/numbers/release', { phoneNumberId: number.id });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const onUnassign = async () => {
    if (!number.activeAssignment) return;
    setBusy(true);
    try {
      await callRoute('/numbers/release-assignment', {
        assignmentId: number.activeAssignment.id,
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <StyledRow>
      <StyledRowMain>
        <div>
          <div style={{ fontWeight: 600 }}>{number.e164}</div>
          {number.friendlyName ? (
            <StyledRowMeta>{number.friendlyName}</StyledRowMeta>
          ) : null}
          <StyledRowMeta>
            {number.provider} ·{' '}
            {[
              number.voiceEnabled && 'Voice',
              number.smsEnabled && 'SMS',
              number.mmsEnabled && 'MMS',
            ]
              .filter(Boolean)
              .join(' · ') || 'No capabilities'}
          </StyledRowMeta>
          <StyledRowMeta>
            {assignedMember
              ? `Assigned to ${memberLabel(assignedMember)}`
              : 'Unassigned'}
          </StyledRowMeta>
        </div>
        <StyledControls>
          <StyledButton
            size="small"
            onClick={() => setEditing((s) => !s)}
            disabled={busy}
          >
            {assignedMember ? 'Reassign' : 'Assign'}
          </StyledButton>
          {assignedMember ? (
            <StyledButton size="small" onClick={onUnassign} disabled={busy}>
              Unassign
            </StyledButton>
          ) : null}
          <StyledButton
            tone="danger"
            size="small"
            onClick={onRelease}
            disabled={busy}
          >
            Release
          </StyledButton>
        </StyledControls>
      </StyledRowMain>
      {editing && (
        <StyledControls>
          <StyledSelect
            value={pickedMemberId}
            onChange={(e) => setPickedMemberId(e.target.value)}
          >
            <option value="">Choose a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberLabel(m)}
              </option>
            ))}
          </StyledSelect>
          <StyledButton
            tone="primary"
            size="small"
            onClick={onReassign}
            disabled={busy || !pickedMemberId}
          >
            {assignedMember ? 'Reassign' : 'Assign'}
          </StyledButton>
        </StyledControls>
      )}
    </StyledRow>
  );
};

const BuyWizard = ({
  members,
  onCancel,
  onPurchased,
}: {
  members: MemberRow[];
  onCancel: () => void;
  onPurchased: () => Promise<void>;
}) => {
  const [areaCode, setAreaCode] = useState('');
  const [contains, setContains] = useState('');
  const [results, setResults] = useState<
    Array<{
      e164: string;
      friendlyName: string;
      locality: string | null;
      region: string | null;
    }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [assignToMemberId, setAssignToMemberId] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);

  const onSearch = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = (await callRoute('/numbers/search', {
        country: 'US',
        areaCode: areaCode.trim() || undefined,
        contains: contains.trim() || undefined,
        limit: 20,
        capabilities: { voice: true, sms: true },
      })) as {
        numbers: Array<{
          e164: string;
          friendlyName: string;
          locality: string | null;
          region: string | null;
        }>;
      };
      setResults(res.numbers);
      if (res.numbers.length === 0) {
        setSearchError('No numbers found for those criteria.');
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const onBuy = async (e164: string) => {
    setBuying(e164);
    try {
      await callRoute('/numbers/buy', {
        e164,
        assignToWorkspaceMemberId: assignToMemberId || undefined,
      });
      await onPurchased();
    } catch (e) {
      window.alert(
        `Purchase failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
    } finally {
      setBuying(null);
    }
  };

  return (
    <StyledSection>
      <StyledHeader>
        <StyledHeading>Buy a number</StyledHeading>
        <StyledButton size="small" onClick={onCancel}>
          Cancel
        </StyledButton>
      </StyledHeader>
      <StyledControls>
        <StyledInput
          type="text"
          inputMode="numeric"
          placeholder="Area code (e.g. 415)"
          value={areaCode}
          onChange={(e) => setAreaCode(e.target.value)}
          maxLength={3}
          style={{ width: 140 }}
        />
        <StyledInput
          type="text"
          placeholder="Contains (e.g. CRM)"
          value={contains}
          onChange={(e) => setContains(e.target.value)}
          style={{ flex: 1 }}
        />
        <StyledButton
          tone="primary"
          size="small"
          onClick={onSearch}
          disabled={searching || (!areaCode.trim() && !contains.trim())}
        >
          {searching ? 'Searching…' : 'Search'}
        </StyledButton>
      </StyledControls>

      <StyledSelect
        value={assignToMemberId}
        onChange={(e) => setAssignToMemberId(e.target.value)}
      >
        <option value="">(Optional) Assign on purchase…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {memberLabel(m)}
          </option>
        ))}
      </StyledSelect>

      {searchError ? (
        <StyledRowMeta style={{ color: '#dc2626' }}>
          {searchError}
        </StyledRowMeta>
      ) : null}

      {results.map((n) => (
        <StyledRow key={n.e164}>
          <StyledRowMain>
            <div>
              <div style={{ fontWeight: 600 }}>{n.friendlyName}</div>
              <StyledRowMeta>
                {[n.locality, n.region].filter(Boolean).join(', ') || '—'}
              </StyledRowMeta>
            </div>
            <StyledButton
              tone="primary"
              size="small"
              onClick={() => onBuy(n.e164)}
              disabled={buying !== null}
            >
              {buying === n.e164 ? 'Buying…' : 'Buy'}
            </StyledButton>
          </StyledRowMain>
        </StyledRow>
      ))}
    </StyledSection>
  );
};
