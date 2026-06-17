import { type CSSProperties, useState } from 'react';
import { defineFrontComponent } from 'twenty-sdk/define';

import { TELEPHONY_AGENT_SOFTPHONE_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers';

type AgentStatus = 'READY' | 'BREAK' | 'LUNCH' | 'TRAINING' | 'OFFLINE';

type NextLead = {
  campaignLeadId: string;
  leadId: string | null;
  campaignId: string | null;
  lockExpiresAt: string;
  blockedReason?: string | null;
};

type CallSession = {
  callSessionId: string;
  provider: string;
  providerCallId?: string | null;
  status: string;
};

type GraphQlResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

const AGENT_STATUS_VALUES: AgentStatus[] = [
  'READY',
  'BREAK',
  'LUNCH',
  'TRAINING',
  'OFFLINE',
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isAgentStatus = (value: unknown): value is AgentStatus =>
  typeof value === 'string' &&
  AGENT_STATUS_VALUES.some((status) => status === value);

const isGraphQlError = (value: unknown): value is { message: string } =>
  isObject(value) && typeof value.message === 'string';

const parseGraphQlResponse = <TData,>(
  payload: unknown,
  isData: (value: unknown) => value is TData,
): GraphQlResponse<TData> => {
  if (!isObject(payload)) {
    return {};
  }

  return {
    data: isData(payload.data) ? payload.data : undefined,
    errors: Array.isArray(payload.errors)
      ? payload.errors.filter(isGraphQlError)
      : undefined,
  };
};

const isStartTelephonySessionData = (
  value: unknown,
): value is {
  startTelephonySession: { sessionId: string; status: AgentStatus };
} => {
  if (!isObject(value) || !isObject(value.startTelephonySession)) {
    return false;
  }

  const session = value.startTelephonySession;

  return (
    typeof session.sessionId === 'string' && isAgentStatus(session.status)
  );
};

const isSetAgentTelephonyStatusData = (
  value: unknown,
): value is { setAgentTelephonyStatus: { status: AgentStatus } } => {
  if (!isObject(value) || !isObject(value.setAgentTelephonyStatus)) {
    return false;
  }

  return isAgentStatus(value.setAgentTelephonyStatus.status);
};

const isNextLead = (value: unknown): value is NextLead => {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.campaignLeadId === 'string' &&
    isNullableString(value.leadId) &&
    isNullableString(value.campaignId) &&
    typeof value.lockExpiresAt === 'string' &&
    (value.blockedReason === undefined || isNullableString(value.blockedReason))
  );
};

const isRequestNextCampaignLeadData = (
  value: unknown,
): value is { requestNextCampaignLead: NextLead | null } =>
  isObject(value) &&
  (value.requestNextCampaignLead === null ||
    isNextLead(value.requestNextCampaignLead));

const isCallSession = (value: unknown): value is CallSession =>
  isObject(value) &&
  typeof value.callSessionId === 'string' &&
  typeof value.provider === 'string' &&
  typeof value.status === 'string' &&
  (value.providerCallId === undefined ||
    isNullableString(value.providerCallId));

const isStartOutboundCallData = (
  value: unknown,
): value is { startOutboundCall: CallSession } =>
  isObject(value) && isCallSession(value.startOutboundCall);

const isReleaseCampaignLeadData = (
  value: unknown,
): value is { releaseCampaignLead: boolean } =>
  isObject(value) && typeof value.releaseCampaignLead === 'boolean';

const getApiConfig = () => {
  const env = typeof process === 'undefined' ? undefined : process.env;

  return {
    apiUrl: env?.['TWENTY_API_URL'] ?? '',
    token: env?.['TWENTY_APP_ACCESS_TOKEN'] ?? '',
  };
};

const metadataMutation = async <TData,>(
  query: string,
  isData: (value: unknown) => value is TData,
  variables?: Record<string, unknown>,
): Promise<TData> => {
  const { apiUrl, token } = getApiConfig();

  const response = await fetch(`${apiUrl}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const rawPayload: unknown = await response.json();
  const payload = parseGraphQlResponse(rawPayload, isData);

  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message ?? 'Telephony request failed');
  }

  if (!payload.data) {
    throw new Error('Telephony request returned no data');
  }

  return payload.data;
};

const styles: Record<string, CSSProperties> = {
  shell: {
    fontFamily: 'Inter, sans-serif',
    padding: '20px',
    color: '#182230',
    display: 'grid',
    gap: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 650,
  },
  section: {
    border: '1px solid #d0d5dd',
    borderRadius: '8px',
    padding: '16px',
    display: 'grid',
    gap: '12px',
    background: '#fff',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 650,
    color: '#475467',
    textTransform: 'uppercase',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
  },
  button: {
    border: '1px solid #98a2b3',
    borderRadius: '6px',
    background: '#fff',
    color: '#344054',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryButton: {
    border: '1px solid #1570ef',
    borderRadius: '6px',
    background: '#1570ef',
    color: '#fff',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  disabledButton: {
    border: '1px solid #eaecf0',
    borderRadius: '6px',
    background: '#f9fafb',
    color: '#98a2b3',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'not-allowed',
  },
  statusPill: {
    borderRadius: '999px',
    background: '#ecfdf3',
    color: '#067647',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 650,
  },
  detail: {
    margin: 0,
    color: '#475467',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  error: {
    border: '1px solid #fecdca',
    background: '#fef3f2',
    color: '#b42318',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '13px',
  },
};

export const AgentSoftphoneWorkspace = () => {
  const [status, setStatus] = useState<AgentStatus>('OFFLINE');
  const [loading, setLoading] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nextLead, setNextLead] = useState<NextLead | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (
    action: string,
    handler: () => Promise<void>,
  ): Promise<void> => {
    setLoading(action);
    setError(null);

    try {
      await handler();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Telephony request failed',
      );
    } finally {
      setLoading(null);
    }
  };

  const handleStartSession = () =>
    runAction('start-session', async () => {
      const data = await metadataMutation<{
        startTelephonySession: { sessionId: string; status: AgentStatus };
      }>(
        `mutation StartTelephonySession {
          startTelephonySession {
            sessionId
            status
          }
        }`,
        isStartTelephonySessionData,
      );

      setSessionId(data.startTelephonySession.sessionId);
      setStatus(data.startTelephonySession.status);
    });

  const handleSetStatus = (nextStatus: AgentStatus) =>
    runAction(`status-${nextStatus}`, async () => {
      const data = await metadataMutation<{
        setAgentTelephonyStatus: { status: AgentStatus };
      }>(
        `mutation SetAgentTelephonyStatus($status: String!) {
          setAgentTelephonyStatus(status: $status) {
            status
          }
        }`,
        isSetAgentTelephonyStatusData,
        { status: nextStatus },
      );

      setStatus(data.setAgentTelephonyStatus.status);
    });

  const handleRequestNextLead = () =>
    runAction('next-lead', async () => {
      const data = await metadataMutation<{
        requestNextCampaignLead: NextLead | null;
      }>(
        `mutation RequestNextCampaignLead {
          requestNextCampaignLead {
            campaignLeadId
            leadId
            campaignId
            lockExpiresAt
            blockedReason
          }
        }`,
        isRequestNextCampaignLeadData,
      );

      setNextLead(data.requestNextCampaignLead);
      setCallSession(null);
    });

  const handleStartCall = () =>
    runAction('start-call', async () => {
      if (!nextLead) {
        throw new Error('No campaign lead is reserved.');
      }

      const data = await metadataMutation<{
        startOutboundCall: CallSession;
      }>(
        `mutation StartOutboundCall($campaignLeadId: String!) {
          startOutboundCall(campaignLeadId: $campaignLeadId) {
            callSessionId
            provider
            providerCallId
            status
          }
        }`,
        isStartOutboundCallData,
        { campaignLeadId: nextLead.campaignLeadId },
      );

      setCallSession(data.startOutboundCall);
    });

  const handleReleaseLead = () =>
    runAction('release-lead', async () => {
      await metadataMutation<{ releaseCampaignLead: boolean }>(
        `mutation ReleaseCampaignLead($reason: String!) {
          releaseCampaignLead(reason: $reason)
        }`,
        isReleaseCampaignLeadData,
        { reason: 'AGENT_RELEASED' },
      );

      setNextLead(null);
      setCallSession(null);
    });

  const isBusy = loading !== null;

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <h1 style={styles.title}>Agent Softphone</h1>
        <span style={styles.statusPill}>{status}</span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Session</h2>
        <div style={styles.row}>
          <button
            type="button"
            style={isBusy ? styles.disabledButton : styles.primaryButton}
            disabled={isBusy}
            onClick={handleStartSession}
          >
            Start session
          </button>
          {AGENT_STATUS_VALUES.map((nextStatus) => (
            <button
              key={nextStatus}
              type="button"
              style={isBusy ? styles.disabledButton : styles.button}
              disabled={isBusy}
              onClick={() => handleSetStatus(nextStatus)}
            >
              {nextStatus}
            </button>
          ))}
        </div>
        <p style={styles.detail}>
          Session ID: {sessionId ?? 'Not started in this browser'}
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Lead Preview</h2>
        <div style={styles.row}>
          <button
            type="button"
            style={isBusy || status !== 'READY' ? styles.disabledButton : styles.primaryButton}
            disabled={isBusy || status !== 'READY'}
            onClick={handleRequestNextLead}
          >
            Next lead
          </button>
          <button
            type="button"
            style={isBusy || !nextLead ? styles.disabledButton : styles.button}
            disabled={isBusy || !nextLead}
            onClick={handleReleaseLead}
          >
            Release
          </button>
        </div>
        <p style={styles.detail}>
          Campaign Lead: {nextLead?.campaignLeadId ?? 'No lead reserved'}
        </p>
        <p style={styles.detail}>
          Lock Expires: {nextLead?.lockExpiresAt ?? 'None'}
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Call</h2>
        <div style={styles.row}>
          <button
            type="button"
            style={isBusy || !nextLead ? styles.disabledButton : styles.primaryButton}
            disabled={isBusy || !nextLead}
            onClick={handleStartCall}
          >
            Call
          </button>
        </div>
        <p style={styles.detail}>
          Call Session: {callSession?.callSessionId ?? 'No active call'}
        </p>
        <p style={styles.detail}>
          Provider: {callSession?.provider ?? 'Not connected'}
        </p>
      </section>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: TELEPHONY_AGENT_SOFTPHONE_FRONT_COMPONENT_ID,
  name: 'Agent Softphone Workspace',
  description: 'Telephony ready-state, lead preview, and call control surface.',
  component: AgentSoftphoneWorkspace,
});
