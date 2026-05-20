import {
  type QaProcessingStatus,
  type QaResult,
  type QaRubricType,
} from 'src/constants/compliance-rules';
import { getErrorMessage } from 'src/utils/error-message';
import {
  graphqlMultipartRequest,
  graphqlRequest,
} from 'src/utils/graphql-client';

const ATTACHMENT_FILE_FIELD_UNIVERSAL_IDENTIFIER =
  '20202020-15db-460e-8166-c7b5d87ad4be';

export type RichTextValue = {
  blocknote: null;
  markdown: string;
};

export type FullNameValue =
  | string
  | {
      firstName?: string | null;
      lastName?: string | null;
    };

export type SourceCall = {
  id: string;
  name?: string | null;
  convosoCallId?: string | null;
  callDate?: string | null;
  duration?: number | null;
  direction?: string | null;
  status?: string | null;
  statusName?: string | null;
  queueName?: string | null;
  leadId?: string | null;
  leadSourceId?: string | null;
  agentId?: string | null;
  recording?: {
    primaryLinkUrl?: string | null;
    primaryLinkLabel?: string | null;
  } | null;
};

export type QaScorecardRecord = {
  id: string;
  name?: string | null;
  sourceCallKey?: string | null;
  callId?: string | null;
  call?: {
    id: string;
    name?: string | null;
    convosoCallId?: string | null;
    recording?: {
      primaryLinkUrl?: string | null;
      primaryLinkLabel?: string | null;
    } | null;
  } | null;
  agentId?: string | null;
  agent?: {
    id: string;
    name?: FullNameValue | null;
  } | null;
  leadId?: string | null;
  lead?: {
    id: string;
    name?: FullNameValue | null;
  } | null;
  qaManagerId?: string | null;
  qaManager?: {
    id: string;
    name?: string | null;
    workspaceMemberId?: string | null;
  } | null;
  taskId?: string | null;
  task?: {
    id: string;
    title?: string | null;
  } | null;
  status?: QaProcessingStatus | null;
  score?: number | null;
  result?: QaResult | null;
  qaType?: QaRubricType | null;
  redFlag?: boolean | null;
};

export type QaScorecardInput = {
  name?: string | null;
  sourceCallKey?: string | null;
  callId?: string | null;
  agentId?: string | null;
  leadId?: string | null;
  qaManagerId?: string | null;
  taskId?: string | null;
  status?: QaProcessingStatus;
  score?: number;
  result?: QaResult;
  qaType?: QaRubricType;
  redFlag?: boolean;
  processingStartedAt?: string;
  analyzedAt?: string;
};

type SourceCallResponse = {
  calls: {
    edges: {
      node: SourceCall;
    }[];
  };
};

type QaScorecardResponse = {
  qaScorecards: {
    edges: {
      node: QaScorecardRecord;
    }[];
  };
};

type QaScorecardsResponse = {
  qaScorecards: {
    edges: {
      node: QaScorecardRecord;
    }[];
  };
};

type CreateQaScorecardResponse = {
  createQaScorecard: QaScorecardRecord;
};

type UpdateQaScorecardResponse = {
  updateQaScorecard: QaScorecardRecord;
};

type CreateNoteResponse = {
  createNote: {
    id: string;
  };
};

type UpdateNoteResponse = {
  updateNote: {
    id: string;
  };
};

type CreateNoteTargetResponse = {
  createNoteTarget: {
    id: string;
  };
};

type AttachmentFileInput = {
  fileId: string;
  label: string;
};

type AttachmentLookupResponse = {
  attachments: {
    edges: {
      node: {
        id: string;
        fullPath?: string | null;
        file?: AttachmentFileInput[] | null;
      };
    }[];
  };
};

type CreateAttachmentResponse = {
  createAttachment: {
    id: string;
  };
};

type UpdateAttachmentResponse = {
  updateAttachment: {
    id: string;
  };
};

type UploadFilesFieldFileResponse = {
  uploadFilesFieldFileByUniversalIdentifier: {
    id: string;
  };
};

type NoteLookupResponse = {
  noteTargets: {
    edges: {
      node: {
        note?: {
          id: string;
          title?: string | null;
        } | null;
      };
    }[];
  };
};

type CreateTaskResponse = {
  createTask: {
    id: string;
  };
};

type TaskCreateData = {
  id?: string;
  title: string;
  bodyV2: RichTextValue;
  status: 'TODO';
  dueAt: string;
  assigneeId?: string;
};

type TaskTargetCreateData =
  | {
      taskId: string;
      targetAgentProfileId: string;
    }
  | {
      taskId: string;
      targetCallId: string;
    }
  | {
      taskId: string;
      targetPersonId: string;
    }
  | {
      taskId: string;
      targetQaScorecardId: string;
    };

type CreateTaskTargetResponse = {
  createTaskTarget: {
    id: string;
  };
};

type TaskTargetLookupResponse = {
  taskTargets: {
    edges: {
      node: {
        id: string;
      };
    }[];
  };
};

type TaskTargetTaskLookupResponse = {
  taskTargets: {
    edges: {
      node: {
        taskId?: string | null;
        task?: {
          id: string;
        } | null;
      };
    }[];
  };
};

export const richText = (markdown: string): RichTextValue => ({
  blocknote: null,
  markdown,
});

export const fetchSourceCall = async (
  callId: string,
): Promise<SourceCall | null> => {
  const data = await graphqlRequest<SourceCallResponse>({
    tokenType: 'workspace',
    variables: { callId },
    query: `
      query ComplianceQaSourceCall($callId: UUID!) {
        calls(filter: { id: { eq: $callId } }, first: 1) {
          edges {
            node {
              id
              name
              convosoCallId
              callDate
              duration
              direction
              status
              statusName
              queueName
              leadId
              leadSourceId
              agentId
              recording {
                primaryLinkUrl
                primaryLinkLabel
              }
            }
          }
        }
      }
    `,
  });

  return data.calls.edges[0]?.node ?? null;
};

const qaScorecardSelection = `
  id
  name
  sourceCallKey
  callId
  call {
    id
    name
    convosoCallId
    recording {
      primaryLinkUrl
      primaryLinkLabel
    }
  }
  agentId
  agent {
    id
    name
  }
  leadId
  lead {
    id
    name
  }
  qaManagerId
  qaManager {
    id
    name
    workspaceMemberId
  }
  taskId
  task {
    id
    title
  }
  status
  score
  result
  qaType
  redFlag
`;

export const findQaScorecardByCallId = async (
  callId: string,
): Promise<QaScorecardRecord | null> => {
  const data = await graphqlRequest<QaScorecardResponse>({
    tokenType: 'app',
    variables: { callId },
    query: `
      query ComplianceQaScorecardByCall($callId: UUID!) {
        qaScorecards(filter: { callId: { eq: $callId } }, first: 1) {
          edges {
            node {
              ${qaScorecardSelection}
            }
          }
        }
      }
    `,
  });

  return data.qaScorecards.edges[0]?.node ?? null;
};

export const findQaScorecardById = async (
  scorecardId: string,
): Promise<QaScorecardRecord | null> => {
  const data = await graphqlRequest<QaScorecardResponse>({
    tokenType: 'app',
    variables: { scorecardId },
    query: `
      query ComplianceQaScorecardById($scorecardId: UUID!) {
        qaScorecards(filter: { id: { eq: $scorecardId } }, first: 1) {
          edges {
            node {
              ${qaScorecardSelection}
            }
          }
        }
      }
    `,
  });

  return data.qaScorecards.edges[0]?.node ?? null;
};

export const findQaScorecardBySourceCallKey = async (
  sourceCallKey: string,
): Promise<QaScorecardRecord | null> => {
  const data = await graphqlRequest<QaScorecardResponse>({
    tokenType: 'app',
    variables: { sourceCallKey },
    query: `
      query ComplianceQaScorecardBySourceCallKey($sourceCallKey: String!) {
        qaScorecards(filter: { sourceCallKey: { eq: $sourceCallKey } }, first: 1) {
          edges {
            node {
              ${qaScorecardSelection}
            }
          }
        }
      }
    `,
  });

  return data.qaScorecards.edges[0]?.node ?? null;
};

const findQaScorecardsByStatus = async (
  status: QaProcessingStatus,
  first: number,
): Promise<QaScorecardRecord[]> => {
  const data = await graphqlRequest<QaScorecardsResponse>({
    tokenType: 'app',
    variables: { first },
    query: `
      query ComplianceQaScorecardsByStatus($first: Int!) {
        qaScorecards(
          filter: { status: { eq: "${status}" } }
          first: $first
        ) {
          edges {
            node {
              ${qaScorecardSelection}
            }
          }
        }
      }
    `,
  });

  return data.qaScorecards.edges.map((edge) => edge.node);
};

export const findProcessableQaScorecards = async (
  first: number,
): Promise<QaScorecardRecord[]> => {
  const copyingRecordingScorecards = await findQaScorecardsByStatus(
    'COPYING_RECORDING',
    first,
  );

  if (copyingRecordingScorecards.length >= first) {
    return copyingRecordingScorecards;
  }

  const transcribingScorecards = await findQaScorecardsByStatus(
    'TRANSCRIBING',
    first - copyingRecordingScorecards.length,
  );

  if (
    copyingRecordingScorecards.length + transcribingScorecards.length >=
    first
  ) {
    return [...copyingRecordingScorecards, ...transcribingScorecards];
  }

  const scoringScorecards = await findQaScorecardsByStatus(
    'SCORING',
    first - copyingRecordingScorecards.length - transcribingScorecards.length,
  );

  return [
    ...copyingRecordingScorecards,
    ...transcribingScorecards,
    ...scoringScorecards,
  ];
};

export const createQaScorecard = async (
  data: QaScorecardInput,
): Promise<QaScorecardRecord> => {
  const result = await graphqlRequest<CreateQaScorecardResponse>({
    tokenType: 'app',
    variables: { data },
    query: `
      mutation CreateComplianceQaScorecard($data: QaScorecardCreateInput!) {
        createQaScorecard(data: $data) {
          ${qaScorecardSelection}
        }
      }
    `,
  });

  return result.createQaScorecard;
};

export const updateQaScorecard = async ({
  id,
  data,
}: {
  id: string;
  data: QaScorecardInput;
}): Promise<QaScorecardRecord> => {
  const result = await graphqlRequest<UpdateQaScorecardResponse>({
    tokenType: 'app',
    variables: { id, data },
    query: `
      mutation UpdateComplianceQaScorecard(
        $id: UUID!
        $data: QaScorecardUpdateInput!
      ) {
        updateQaScorecard(id: $id, data: $data) {
          ${qaScorecardSelection}
        }
      }
    `,
  });

  return result.updateQaScorecard;
};

const findQaScorecardNoteId = async ({
  scorecardId,
  title,
}: {
  scorecardId: string;
  title: string;
}): Promise<string | null> => {
  const result = await graphqlRequest<NoteLookupResponse>({
    tokenType: 'workspace',
    variables: { scorecardId },
    query: `
      query FindComplianceQaNote($scorecardId: UUID!) {
        noteTargets(
          filter: { targetQaScorecardId: { eq: $scorecardId } }
          first: 100
        ) {
          edges {
            node {
              note {
                id
                title
              }
            }
          }
        }
      }
    `,
  });

  const exactNoteTarget = result.noteTargets.edges.find(
    (edge) => edge.node.note?.title === title,
  );

  if (exactNoteTarget !== undefined) {
    return exactNoteTarget.node.note?.id ?? null;
  }

  const legacyTitle = `QA ${title}`;
  const legacyNoteTarget = result.noteTargets.edges.find(
    (edge) => edge.node.note?.title === legacyTitle,
  );

  return legacyNoteTarget?.node.note?.id ?? null;
};

const createQaScorecardNote = async ({
  scorecardId,
  title,
  markdown,
}: {
  scorecardId: string;
  title: string;
  markdown: string;
}): Promise<string> => {
  const noteResult = await graphqlRequest<CreateNoteResponse>({
    tokenType: 'workspace',
    variables: {
      data: {
        title,
        bodyV2: richText(markdown),
      },
    },
    query: `
      mutation CreateComplianceQaNote($data: NoteCreateInput!) {
        createNote(data: $data) {
          id
        }
      }
    `,
  });

  await graphqlRequest<CreateNoteTargetResponse>({
    tokenType: 'workspace',
    variables: {
      data: {
        noteId: noteResult.createNote.id,
        targetQaScorecardId: scorecardId,
      },
    },
    query: `
      mutation CreateComplianceQaNoteTarget($data: NoteTargetCreateInput!) {
        createNoteTarget(data: $data) {
          id
        }
      }
    `,
  });

  return noteResult.createNote.id;
};

export const upsertQaScorecardNote = async ({
  scorecardId,
  title,
  markdown,
}: {
  scorecardId: string;
  title: string;
  markdown: string;
}): Promise<string> => {
  const existingNoteId = await findQaScorecardNoteId({
    scorecardId,
    title,
  });

  if (existingNoteId === null) {
    return createQaScorecardNote({ scorecardId, title, markdown });
  }

  const updateResult = await graphqlRequest<UpdateNoteResponse>({
    tokenType: 'workspace',
    variables: {
      id: existingNoteId,
      data: {
        title,
        bodyV2: richText(markdown),
      },
    },
    query: `
      mutation UpdateComplianceQaNote($id: UUID!, $data: NoteUpdateInput!) {
        updateNote(id: $id, data: $data) {
          id
        }
      }
    `,
  });

  return updateResult.updateNote.id;
};

const findQaScorecardAttachment = async ({
  scorecardId,
  name,
}: {
  scorecardId: string;
  name: string;
}): Promise<{
  id: string;
  fullPath?: string | null;
  file?: AttachmentFileInput[] | null;
} | null> => {
  const result = await graphqlRequest<AttachmentLookupResponse>({
    tokenType: 'workspace',
    variables: { scorecardId, name },
    query: `
      query FindComplianceQaAttachment($scorecardId: UUID!, $name: String!) {
        attachments(
          filter: {
            name: { eq: $name }
            targetQaScorecardId: { eq: $scorecardId }
          }
          first: 1
        ) {
          edges {
            node {
              id
              fullPath
              file {
                fileId
                label
              }
            }
          }
        }
      }
    `,
  });

  return result.attachments.edges[0]?.node ?? null;
};

export const hasQaScorecardAttachmentFile = async ({
  scorecardId,
  name,
}: {
  scorecardId: string;
  name: string;
}): Promise<boolean> => {
  const attachment = await findQaScorecardAttachment({ scorecardId, name });

  return (
    attachment?.file !== undefined &&
    attachment.file !== null &&
    attachment.file.length > 0
  );
};

export const findQaScorecardAttachmentFullPath = async ({
  scorecardId,
  name,
}: {
  scorecardId: string;
  name: string;
}): Promise<string | null> => {
  const attachment = await findQaScorecardAttachment({ scorecardId, name });
  const fullPath = attachment?.fullPath?.trim();

  return fullPath !== undefined && fullPath.length > 0 ? fullPath : null;
};

const uploadFilesFieldFile = async ({
  filename,
  content,
  contentType,
}: {
  filename: string;
  content: Uint8Array;
  contentType: string;
}): Promise<AttachmentFileInput> => {
  const result = await graphqlMultipartRequest<UploadFilesFieldFileResponse>({
    tokenType: 'app',
    apiPath: '/metadata',
    variables: {
      file: null,
      fieldMetadataUniversalIdentifier:
        ATTACHMENT_FILE_FIELD_UNIVERSAL_IDENTIFIER,
    },
    file: {
      variablePath: 'variables.file',
      filename,
      content,
      contentType,
    },
    query: `
      mutation UploadComplianceQaAttachmentFile(
        $file: Upload!
        $fieldMetadataUniversalIdentifier: String!
      ) {
        uploadFilesFieldFileByUniversalIdentifier(
          file: $file
          fieldMetadataUniversalIdentifier: $fieldMetadataUniversalIdentifier
        ) {
          id
        }
      }
    `,
  });

  return {
    fileId: result.uploadFilesFieldFileByUniversalIdentifier.id,
    label: filename,
  };
};

export const upsertQaScorecardAttachment = async ({
  scorecardId,
  name,
  filename,
  content,
  contentType,
}: {
  scorecardId: string;
  name: string;
  filename: string;
  content: Uint8Array;
  contentType: string;
}): Promise<string> => {
  const existingAttachment = await findQaScorecardAttachment({
    scorecardId,
    name,
  });

  if (
    existingAttachment?.file !== undefined &&
    existingAttachment.file !== null &&
    existingAttachment.file.length > 0
  ) {
    return existingAttachment.id;
  }

  const file = await uploadFilesFieldFile({
    filename,
    content,
    contentType,
  });

  if (existingAttachment === null) {
    const createResult = await graphqlRequest<CreateAttachmentResponse>({
      tokenType: 'workspace',
      variables: {
        data: {
          name,
          file: [file],
          targetQaScorecardId: scorecardId,
        },
      },
      query: `
        mutation CreateComplianceQaAttachment($data: AttachmentCreateInput!) {
          createAttachment(data: $data) {
            id
          }
        }
      `,
    });

    return createResult.createAttachment.id;
  }

  const updateResult = await graphqlRequest<UpdateAttachmentResponse>({
    tokenType: 'workspace',
    variables: {
      id: existingAttachment.id,
      data: {
        name,
        file: [file],
      },
    },
    query: `
      mutation UpdateComplianceQaAttachment(
        $id: UUID!
        $data: AttachmentUpdateInput!
      ) {
        updateAttachment(id: $id, data: $data) {
          id
        }
      }
    `,
  });

  return updateResult.updateAttachment.id;
};

export const createFollowUpTask = async ({
  id,
  title,
  markdown,
  assigneeId,
}: {
  id?: string;
  title: string;
  markdown: string;
  assigneeId?: string | null;
}): Promise<string> => {
  const data: TaskCreateData = {
    title,
    bodyV2: richText(markdown),
    status: 'TODO',
    dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  };

  if (id !== undefined && id.length > 0) {
    data.id = id;
  }

  if (
    assigneeId !== undefined &&
    assigneeId !== null &&
    assigneeId.length > 0
  ) {
    data.assigneeId = assigneeId;
  }

  const result = await graphqlRequest<CreateTaskResponse>({
    tokenType: 'workspace',
    variables: { data },
    query: `
      mutation CreateComplianceQaFollowUpTask($data: TaskCreateInput!) {
        createTask(data: $data) {
          id
        }
      }
    `,
  });

  return result.createTask.id;
};

const getFirstTaskTargetId = (
  response: TaskTargetLookupResponse,
): string | null => response.taskTargets.edges[0]?.node.id ?? null;

export const findTaskIdLinkedToQaScorecard = async (
  scorecardId: string,
): Promise<string | null> => {
  const result = await graphqlRequest<TaskTargetTaskLookupResponse>({
    tokenType: 'workspace',
    variables: { scorecardId },
    query: `
      query FindComplianceQaLinkedTask($scorecardId: UUID!) {
        taskTargets(
          filter: { targetQaScorecardId: { eq: $scorecardId } }
          first: 1
        ) {
          edges {
            node {
              taskId
              task {
                id
              }
            }
          }
        }
      }
    `,
  });
  const node = result.taskTargets.edges[0]?.node;

  return node?.taskId ?? node?.task?.id ?? null;
};

const createTaskTarget = async (
  data: TaskTargetCreateData,
): Promise<string> => {
  const result = await graphqlRequest<CreateTaskTargetResponse>({
    tokenType: 'workspace',
    variables: { data },
    query: `
      mutation CreateComplianceQaTaskTarget($data: TaskTargetCreateInput!) {
        createTaskTarget(data: $data) {
          id
        }
      }
    `,
  });

  return result.createTaskTarget.id;
};

const findTaskTargetForQaScorecard = async ({
  taskId,
  scorecardId,
}: {
  taskId: string;
  scorecardId: string;
}): Promise<string | null> => {
  const result = await graphqlRequest<TaskTargetLookupResponse>({
    tokenType: 'workspace',
    variables: { taskId, scorecardId },
    query: `
      query FindComplianceQaScorecardTaskTarget(
        $taskId: UUID!
        $scorecardId: UUID!
      ) {
        taskTargets(
          filter: {
            taskId: { eq: $taskId }
            targetQaScorecardId: { eq: $scorecardId }
          }
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
  });

  return getFirstTaskTargetId(result);
};

const findTaskTargetForCall = async ({
  taskId,
  callId,
}: {
  taskId: string;
  callId: string;
}): Promise<string | null> => {
  const result = await graphqlRequest<TaskTargetLookupResponse>({
    tokenType: 'workspace',
    variables: { taskId, callId },
    query: `
      query FindComplianceQaCallTaskTarget($taskId: UUID!, $callId: UUID!) {
        taskTargets(
          filter: {
            taskId: { eq: $taskId }
            targetCallId: { eq: $callId }
          }
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
  });

  return getFirstTaskTargetId(result);
};

const findTaskTargetForLead = async ({
  taskId,
  leadId,
}: {
  taskId: string;
  leadId: string;
}): Promise<string | null> => {
  const result = await graphqlRequest<TaskTargetLookupResponse>({
    tokenType: 'workspace',
    variables: { taskId, leadId },
    query: `
      query FindComplianceQaLeadTaskTarget($taskId: UUID!, $leadId: UUID!) {
        taskTargets(
          filter: {
            taskId: { eq: $taskId }
            targetPersonId: { eq: $leadId }
          }
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
  });

  return getFirstTaskTargetId(result);
};

const findTaskTargetForAgentProfile = async ({
  taskId,
  agentId,
}: {
  taskId: string;
  agentId: string;
}): Promise<string | null> => {
  const result = await graphqlRequest<TaskTargetLookupResponse>({
    tokenType: 'workspace',
    variables: { taskId, agentId },
    query: `
      query FindComplianceQaAgentTaskTarget($taskId: UUID!, $agentId: UUID!) {
        taskTargets(
          filter: {
            taskId: { eq: $taskId }
            targetAgentProfileId: { eq: $agentId }
          }
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `,
  });

  return getFirstTaskTargetId(result);
};

const linkTaskToQaScorecardIfSupported = async ({
  taskId,
  scorecardId,
}: {
  taskId: string;
  scorecardId: string;
}): Promise<string | null> => {
  try {
    const existingTaskTargetId = await findTaskTargetForQaScorecard({
      taskId,
      scorecardId,
    });

    if (existingTaskTargetId !== null) {
      return existingTaskTargetId;
    }

    return await createTaskTarget({
      taskId,
      targetQaScorecardId: scorecardId,
    });
  } catch (error) {
    console.warn(
      '[compliance-qa] Could not link task to QA scorecard; keeping scorecard relation only:',
      getErrorMessage(error),
    );

    return null;
  }
};

const linkTaskToCallIfSupported = async ({
  taskId,
  callId,
}: {
  taskId: string;
  callId: string;
}): Promise<string | null> => {
  try {
    const existingTaskTargetId = await findTaskTargetForCall({
      taskId,
      callId,
    });

    if (existingTaskTargetId !== null) {
      return existingTaskTargetId;
    }

    return await createTaskTarget({
      taskId,
      targetCallId: callId,
    });
  } catch (error) {
    console.warn(
      '[compliance-qa] Could not link task to call; leaving call reference in task body:',
      getErrorMessage(error),
    );

    return null;
  }
};

const linkTaskToLeadIfSupported = async ({
  taskId,
  leadId,
}: {
  taskId: string;
  leadId: string;
}): Promise<string | null> => {
  try {
    const existingTaskTargetId = await findTaskTargetForLead({
      taskId,
      leadId,
    });

    if (existingTaskTargetId !== null) {
      return existingTaskTargetId;
    }

    return await createTaskTarget({
      taskId,
      targetPersonId: leadId,
    });
  } catch (error) {
    console.warn(
      '[compliance-qa] Could not link task to lead; leaving lead reference in task body:',
      getErrorMessage(error),
    );

    return null;
  }
};

const linkTaskToAgentProfileIfSupported = async ({
  taskId,
  agentId,
}: {
  taskId: string;
  agentId: string;
}): Promise<string | null> => {
  try {
    const existingTaskTargetId = await findTaskTargetForAgentProfile({
      taskId,
      agentId,
    });

    if (existingTaskTargetId !== null) {
      return existingTaskTargetId;
    }

    return await createTaskTarget({
      taskId,
      targetAgentProfileId: agentId,
    });
  } catch (error) {
    console.warn(
      '[compliance-qa] Could not link task to agent; leaving agent reference in task body:',
      getErrorMessage(error),
    );

    return null;
  }
};

export const linkTaskToComplianceContextIfSupported = async ({
  taskId,
  scorecardId,
  callId,
  leadId,
  agentId,
}: {
  taskId: string;
  scorecardId: string;
  callId?: string | null;
  leadId?: string | null;
  agentId?: string | null;
}): Promise<void> => {
  await Promise.all([
    linkTaskToQaScorecardIfSupported({ taskId, scorecardId }),
    callId !== undefined && callId !== null && callId.length > 0
      ? linkTaskToCallIfSupported({ taskId, callId })
      : Promise.resolve(null),
    leadId !== undefined && leadId !== null && leadId.length > 0
      ? linkTaskToLeadIfSupported({ taskId, leadId })
      : Promise.resolve(null),
    agentId !== undefined && agentId !== null && agentId.length > 0
      ? linkTaskToAgentProfileIfSupported({ taskId, agentId })
      : Promise.resolve(null),
  ]);
};
