import { definePostInstallLogicFunction } from 'twenty-sdk/define';
import { type InstallPayload } from 'twenty-sdk/logic-function';

import { graphqlRequest } from 'src/utils/graphql-client';

const COMPLIANCE_QA_WORKFLOW_ID = '32ef78c2-f7f2-4e07-96b0-8b35e57b2d13';
const COMPLIANCE_QA_WORKFLOW_NAME = 'Compliance Call Pipeline';
const START_COMPLIANCE_QA_STEP_ID = '7e0d53e9-605f-4c57-b1d8-1296d7c3f1e0';
const START_COMPLIANCE_QA_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER =
  '3fbf987a-8a7d-4ead-aef8-5e89a36555e7';
const COMPLETE_COMPLIANCE_QA_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER =
  '1d130ba7-5495-481c-935a-30397621df56';

const CALL_FIELDS_THAT_CAN_AFFECT_QA_ELIGIBILITY = [
  'recording',
  'agentId',
  'callDate',
  'direction',
  'duration',
  'leadId',
  'leadSourceId',
  'queueName',
  'status',
  'statusName',
];

type WorkflowVersionStatus = 'DRAFT' | 'ACTIVE' | 'DEACTIVATED' | 'ARCHIVED';

type WorkflowStepType = 'LOGIC_FUNCTION' | 'DELAY' | 'IF_ELSE';

type WorkflowPosition = {
  x: number;
  y: number;
};

type WorkflowOutputSchemaLeaf = {
  type: string;
  label: string;
  value: unknown;
  isLeaf: true;
};

type WorkflowErrorHandlingOptions = {
  continueOnFailure: {
    value: boolean;
  };
  retryOnFailure: {
    value: boolean;
  };
};

type WorkflowIfElseBranch = {
  id: string;
  filterGroupId?: string;
  nextStepIds: string[];
};

type WorkflowStepFilterGroup = {
  id: string;
  logicalOperator: 'AND';
};

type WorkflowStepFilter = {
  id: string;
  type: 'boolean';
  value: string;
  operand: 'IS';
  isFullRecord: false;
  stepOutputKey: string;
  stepFilterGroupId: string;
  positionInStepFilterGroup: number;
};

type WorkflowStepRecord = {
  id: string;
  name: string;
  type: string;
  valid: boolean;
  settings: Record<string, unknown>;
  nextStepIds?: string[] | null;
  position?: WorkflowPosition | null;
};

type WorkflowTriggerRecord = {
  name: string;
  type: 'DATABASE_EVENT';
  settings: {
    eventName: string;
    fields: string[];
    outputSchema: Record<string, unknown>;
  };
  nextStepIds: string[];
  position: WorkflowPosition;
};

type WorkflowRecord = {
  id: string;
  name?: string | null;
  statuses?: string[] | null;
  lastPublishedVersionId?: string | null;
};

type WorkflowVersionRecord = {
  id: string;
  name?: string | null;
  status: WorkflowVersionStatus;
  trigger?: WorkflowTriggerRecord | null;
  steps?: WorkflowStepRecord[] | null;
  workflowId: string;
};

type LogicFunctionRecord = {
  id: string;
  name: string;
  universalIdentifier?: string | null;
};

type FindComplianceWorkflowResponse = {
  workflows: {
    edges: Array<{
      node: WorkflowRecord;
    }>;
  };
  workflowVersions: {
    edges: Array<{
      node: WorkflowVersionRecord;
    }>;
  };
};

type FindManyLogicFunctionsResponse = {
  findManyLogicFunctions: LogicFunctionRecord[];
};

type CreateWorkflowResponse = {
  createWorkflow: {
    id: string;
  };
};

type UpdateWorkflowVersionResponse = {
  updateWorkflowVersion: WorkflowVersionRecord;
};

type CreateDraftFromWorkflowVersionResponse = {
  createDraftFromWorkflowVersion: WorkflowVersionRecord;
};

type CreateWorkflowVersionStepResponse = {
  createWorkflowVersionStep: {
    triggerDiff?: unknown;
    stepsDiff?: unknown;
  };
};

type UpdateWorkflowVersionStepResponse = {
  updateWorkflowVersionStep: WorkflowStepRecord;
};

type DeleteWorkflowVersionStepResponse = {
  deleteWorkflowVersionStep: {
    triggerDiff?: unknown;
    stepsDiff?: unknown;
  };
};

type ActivateWorkflowVersionResponse = {
  activateWorkflowVersion: boolean;
};

type ComplianceWorkflowState = {
  workflow: WorkflowRecord | null;
  versions: WorkflowVersionRecord[];
};

type ComplianceQaLogicFunctions = {
  start: LogicFunctionRecord;
  complete: LogicFunctionRecord;
};

type PostInstallResult = {
  workflowId: string;
  workflowVersionId?: string;
  status: 'created' | 'updated' | 'already-active' | 'left-unchanged';
  message: string;
};

type PollingAttempt = {
  waitMinutes: number;
  delayStepId: string;
  completeStepId: string;
  ifStepId?: string;
  ifBranchId?: string;
  elseBranchId?: string;
  filterGroupId?: string;
  filterId?: string;
};

type WorkflowStepSpec = {
  id: string;
  stepType: WorkflowStepType;
  position: WorkflowPosition;
  defaultSettings?: Record<string, unknown>;
};

const WORKFLOW_ERROR_HANDLING_OPTIONS: WorkflowErrorHandlingOptions = {
  continueOnFailure: {
    value: false,
  },
  retryOnFailure: {
    value: false,
  },
};

const POLLING_ATTEMPTS: PollingAttempt[] = [
  {
    waitMinutes: 5,
    delayStepId: 'fa1830e7-5bde-455b-bba9-23de96317a19',
    completeStepId: '4de63a89-a41a-4669-b4ca-2466fc87a97e',
    ifStepId: '25c00174-affb-4701-9e9b-d5840a91b989',
    ifBranchId: 'b3e192bd-178a-43bc-a96d-7c9782de20ca',
    elseBranchId: '17a935d5-0d7e-44ef-bc05-78463167daeb',
    filterGroupId: '5329492d-4078-470c-80e0-e6e91d7afeb9',
    filterId: '4c7c943e-a588-442c-bf10-278e5628c9b2',
  },
  {
    waitMinutes: 10,
    delayStepId: 'baf8d71c-8a77-4b79-b112-2f5de61fe467',
    completeStepId: '55aa125e-619e-448f-8188-449332954461',
    ifStepId: 'e6ab0f6e-eabe-4eab-9325-c430d30c07f6',
    ifBranchId: '5a87f56b-22e7-441f-98e0-4c52ae537cb0',
    elseBranchId: '2562376f-cf48-4344-8420-3127e894d74b',
    filterGroupId: 'c05000d3-05cd-409f-87f6-bb3a64004976',
    filterId: '5809c590-4737-475c-8322-18b30eaa7fa8',
  },
  {
    waitMinutes: 20,
    delayStepId: 'a20abbba-9d01-4472-b028-1e9e8fd990be',
    completeStepId: '3353e0a1-a5a7-4e08-90bc-874918caa43d',
    ifStepId: 'dc01e533-133e-4ce6-b73d-a8c39f654d79',
    ifBranchId: '165bd9e7-b0aa-4ac3-9330-aacb906acea0',
    elseBranchId: '71991ca9-83e1-4af5-b856-246ef1fdf041',
    filterGroupId: '985c26d6-d40b-43a1-9140-14116987e939',
    filterId: '4467b336-10a2-4a4c-8e10-345b1744b13d',
  },
  {
    waitMinutes: 30,
    delayStepId: 'ea4cdea0-c9d7-4645-91de-226480a419d7',
    completeStepId: 'd4287030-53ab-4117-9d64-27135c8716a9',
    ifStepId: '00ad6ddb-f373-4ed0-aecf-dc74e33619b1',
    ifBranchId: 'ce9cec0c-4c71-4aa5-be46-75c9dd1a0c57',
    elseBranchId: '036c0cd9-77c9-4b7f-b5b1-1d964f6c2bbf',
    filterGroupId: 'f67ffda0-3796-42b8-bb0a-360ba31923c5',
    filterId: '8c0b1f32-1a75-421f-b538-09b385329d14',
  },
  {
    waitMinutes: 60,
    delayStepId: '094e71b6-6e8e-463e-8450-5a16018c4920',
    completeStepId: '19152e7d-0a8c-476a-a193-ac96c63b9efc',
    ifStepId: '0c9aa40b-1ee6-4075-84ff-5595423b527d',
    ifBranchId: '6874ba38-15a8-4b1a-a293-a941772de56b',
    elseBranchId: '800fc53a-0f96-4d46-8302-d5d27ba191a5',
    filterGroupId: 'c9aaed2c-01e6-41b5-befb-0a20dde30d0d',
    filterId: '041ef806-2571-4928-a8e8-b4470c7ddd99',
  },
  {
    waitMinutes: 120,
    delayStepId: '9932fcd5-02fb-4632-b4d6-3901223cc165',
    completeStepId: 'e67cd701-901b-4fb0-b341-fbe8a9e40cac',
  },
];

const workflowOutputLeaf = ({
  type,
  label,
  value,
}: {
  type: string;
  label: string;
  value: unknown;
}): WorkflowOutputSchemaLeaf => ({
  type,
  label,
  value,
  isLeaf: true,
});

const buildStartOutputSchema = (): Record<
  string,
  WorkflowOutputSchemaLeaf
> => ({
  success: workflowOutputLeaf({
    type: 'boolean',
    label: 'success',
    value: true,
  }),
  scorecardId: workflowOutputLeaf({
    type: 'string',
    label: 'scorecardId',
    value: '00000000-0000-0000-0000-000000000000',
  }),
  status: workflowOutputLeaf({
    type: 'string',
    label: 'status',
    value: 'TRANSCRIBING',
  }),
  error: workflowOutputLeaf({
    type: 'string',
    label: 'error',
    value: 'Error message',
  }),
});

const buildCompleteOutputSchema = (): Record<
  string,
  WorkflowOutputSchemaLeaf
> => ({
  processed: workflowOutputLeaf({
    type: 'number',
    label: 'processed',
    value: 1,
  }),
  status: workflowOutputLeaf({
    type: 'string',
    label: 'status',
    value: 'COMPLETED',
  }),
  scorecardId: workflowOutputLeaf({
    type: 'string',
    label: 'scorecardId',
    value: '00000000-0000-0000-0000-000000000000',
  }),
  shouldPollAgain: workflowOutputLeaf({
    type: 'boolean',
    label: 'shouldPollAgain',
    value: true,
  }),
  results: workflowOutputLeaf({
    type: 'array',
    label: 'results',
    value: [],
  }),
});

const findComplianceQaLogicFunctions =
  async (): Promise<ComplianceQaLogicFunctions> => {
    const response = await graphqlRequest<FindManyLogicFunctionsResponse>({
      tokenType: 'app',
      apiPath: '/metadata',
      query: `
        query FindManyLogicFunctionsForComplianceQaPostInstall {
          findManyLogicFunctions {
            id
            name
            universalIdentifier
          }
        }
      `,
    });

    const startLogicFunction = response.findManyLogicFunctions.find(
      (candidate) =>
        candidate.universalIdentifier ===
        START_COMPLIANCE_QA_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
    );
    const completeLogicFunction = response.findManyLogicFunctions.find(
      (candidate) =>
        candidate.universalIdentifier ===
        COMPLETE_COMPLIANCE_QA_LOGIC_FUNCTION_UNIVERSAL_IDENTIFIER,
    );

    if (startLogicFunction === undefined) {
      throw new Error(
        'Start Compliance QA logic function was not found after app sync.',
      );
    }

    if (completeLogicFunction === undefined) {
      throw new Error(
        'Complete Compliance QA logic function was not found after app sync.',
      );
    }

    return {
      start: startLogicFunction,
      complete: completeLogicFunction,
    };
  };

const findComplianceWorkflow = async (): Promise<ComplianceWorkflowState> => {
  const response = await graphqlRequest<FindComplianceWorkflowResponse>({
    tokenType: 'workspace',
    variables: {
      workflowId: COMPLIANCE_QA_WORKFLOW_ID,
    },
    query: `
      query FindComplianceQaWorkflow($workflowId: UUID!) {
        workflows(filter: { id: { eq: $workflowId } }, first: 1) {
          edges {
            node {
              id
              name
              statuses
              lastPublishedVersionId
            }
          }
        }
        workflowVersions(
          filter: { workflowId: { eq: $workflowId } }
          first: 100
        ) {
          edges {
            node {
              id
              name
              status
              trigger
              steps
              workflowId
            }
          }
        }
      }
    `,
  });

  return {
    workflow: response.workflows.edges[0]?.node ?? null,
    versions: response.workflowVersions.edges.map((edge) => edge.node),
  };
};

const createComplianceWorkflow = async (): Promise<void> => {
  await graphqlRequest<CreateWorkflowResponse>({
    tokenType: 'workspace',
    variables: {
      data: {
        id: COMPLIANCE_QA_WORKFLOW_ID,
        name: COMPLIANCE_QA_WORKFLOW_NAME,
      },
    },
    query: `
      mutation CreateComplianceQaWorkflow($data: WorkflowCreateInput!) {
        createWorkflow(data: $data) {
          id
        }
      }
    `,
  });
};

const getDraftVersion = (
  versions: WorkflowVersionRecord[],
): WorkflowVersionRecord | null =>
  versions.find((version) => version.status === 'DRAFT') ?? null;

const getActiveVersion = (
  workflow: WorkflowRecord,
  versions: WorkflowVersionRecord[],
): WorkflowVersionRecord | null => {
  const lastPublishedVersion =
    workflow.lastPublishedVersionId === undefined ||
    workflow.lastPublishedVersionId === null
      ? null
      : (versions.find(
          (version) => version.id === workflow.lastPublishedVersionId,
        ) ?? null);

  return (
    lastPublishedVersion ??
    versions.find((version) => version.status === 'ACTIVE') ??
    null
  );
};

const buildComplianceWorkflowTrigger = ({
  nextStepIds,
}: {
  nextStepIds: string[];
}): WorkflowTriggerRecord => ({
  name: 'Call is created or updated',
  type: 'DATABASE_EVENT',
  settings: {
    eventName: 'call.upserted',
    fields: CALL_FIELDS_THAT_CAN_AFFECT_QA_ELIGIBILITY,
    outputSchema: {},
  },
  nextStepIds,
  position: {
    x: 0,
    y: 0,
  },
});

const updateWorkflowVersionTrigger = async ({
  workflowVersionId,
  nextStepIds,
}: {
  workflowVersionId: string;
  nextStepIds: string[];
}): Promise<WorkflowVersionRecord> => {
  const response = await graphqlRequest<UpdateWorkflowVersionResponse>({
    tokenType: 'workspace',
    variables: {
      id: workflowVersionId,
      data: {
        trigger: buildComplianceWorkflowTrigger({ nextStepIds }),
      },
    },
    query: `
      mutation UpdateComplianceQaWorkflowTrigger(
        $id: UUID!
        $data: WorkflowVersionUpdateInput!
      ) {
        updateWorkflowVersion(id: $id, data: $data) {
          id
          name
          status
          trigger
          steps
          workflowId
        }
      }
    `,
  });

  return response.updateWorkflowVersion;
};

const createDraftFromWorkflowVersion = async ({
  workflowId,
  workflowVersionIdToCopy,
}: {
  workflowId: string;
  workflowVersionIdToCopy: string;
}): Promise<WorkflowVersionRecord> => {
  const response = await graphqlRequest<CreateDraftFromWorkflowVersionResponse>(
    {
      tokenType: 'workspace',
      variables: {
        input: {
          workflowId,
          workflowVersionIdToCopy,
        },
      },
      query: `
        mutation CreateComplianceQaDraftWorkflowVersion(
          $input: CreateDraftFromWorkflowVersionInput!
        ) {
          createDraftFromWorkflowVersion(input: $input) {
            id
            name
            status
            trigger
            steps
            workflowId
          }
        }
      `,
    },
  );

  return response.createDraftFromWorkflowVersion;
};

const createWorkflowStep = async ({
  workflowVersionId,
  stepType,
  id,
  position,
  defaultSettings,
}: {
  workflowVersionId: string;
  stepType: WorkflowStepType;
  id: string;
  position: WorkflowPosition;
  defaultSettings?: Record<string, unknown>;
}): Promise<void> => {
  const input: {
    workflowVersionId: string;
    stepType: WorkflowStepType;
    id: string;
    position: WorkflowPosition;
    defaultSettings?: Record<string, unknown>;
  } = {
    workflowVersionId,
    stepType,
    id,
    position,
  };

  if (defaultSettings !== undefined) {
    input.defaultSettings = defaultSettings;
  }

  await graphqlRequest<CreateWorkflowVersionStepResponse>({
    tokenType: 'workspace',
    variables: {
      input,
    },
    query: `
      mutation CreateComplianceQaWorkflowStep(
        $input: CreateWorkflowVersionStepInput!
      ) {
        createWorkflowVersionStep(input: $input) {
          triggerDiff
          stepsDiff
        }
      }
    `,
  });
};

const updateWorkflowStep = async ({
  workflowVersionId,
  step,
}: {
  workflowVersionId: string;
  step: WorkflowStepRecord;
}): Promise<void> => {
  await graphqlRequest<UpdateWorkflowVersionStepResponse>({
    tokenType: 'workspace',
    variables: {
      input: {
        workflowVersionId,
        step,
      },
    },
    query: `
      mutation UpdateComplianceQaWorkflowStep(
        $input: UpdateWorkflowVersionStepInput!
      ) {
        updateWorkflowVersionStep(input: $input) {
          id
          name
          type
          settings
          valid
          nextStepIds
          position {
            x
            y
          }
        }
      }
    `,
  });
};

const deleteWorkflowStep = async ({
  workflowVersionId,
  stepId,
}: {
  workflowVersionId: string;
  stepId: string;
}): Promise<void> => {
  await graphqlRequest<DeleteWorkflowVersionStepResponse>({
    tokenType: 'workspace',
    variables: {
      input: {
        workflowVersionId,
        stepId,
      },
    },
    query: `
      mutation DeleteComplianceQaWorkflowStep(
        $input: DeleteWorkflowVersionStepInput!
      ) {
        deleteWorkflowVersionStep(input: $input) {
          triggerDiff
          stepsDiff
        }
      }
    `,
  });
};

const getWorkflowStateAfterCreate =
  async (): Promise<ComplianceWorkflowState> => {
    const state = await findComplianceWorkflow();

    if (state.workflow === null) {
      await createComplianceWorkflow();

      return findComplianceWorkflow();
    }

    return state;
  };

const refreshWorkflowVersion = async (
  workflowVersionId: string,
): Promise<WorkflowVersionRecord> => {
  const state = await findComplianceWorkflow();
  const workflowVersion = state.versions.find(
    (version) => version.id === workflowVersionId,
  );

  if (workflowVersion === undefined) {
    throw new Error(`Workflow version not found: ${workflowVersionId}`);
  }

  return workflowVersion;
};

const getPollingAttemptStepIds = (attempt: PollingAttempt): string[] => {
  const stepIds = [attempt.delayStepId, attempt.completeStepId];

  if (attempt.ifStepId !== undefined) {
    stepIds.push(attempt.ifStepId);
  }

  return stepIds;
};

const getExpectedWorkflowStepIds = (): string[] => [
  START_COMPLIANCE_QA_STEP_ID,
  ...POLLING_ATTEMPTS.flatMap((attempt) => getPollingAttemptStepIds(attempt)),
];

const isConfiguredComplianceWorkflowVersion = (
  workflowVersion: WorkflowVersionRecord,
): boolean => {
  const steps = workflowVersion.steps ?? [];
  const stepIds = new Set(steps.map((step) => step.id));
  const expectedStepIds = getExpectedWorkflowStepIds();
  const startStep = steps.find(
    (step) => step.id === START_COMPLIANCE_QA_STEP_ID,
  );

  return (
    workflowVersion.trigger?.nextStepIds.includes(
      START_COMPLIANCE_QA_STEP_ID,
    ) === true &&
    expectedStepIds.every((stepId) => stepIds.has(stepId)) &&
    startStep?.nextStepIds?.includes(POLLING_ATTEMPTS[0].delayStepId) === true
  );
};

const buildWorkflowStepSpecs = ({
  startLogicFunctionId,
  completeLogicFunctionId,
}: {
  startLogicFunctionId: string;
  completeLogicFunctionId: string;
}): WorkflowStepSpec[] => {
  const specs: WorkflowStepSpec[] = [
    {
      id: START_COMPLIANCE_QA_STEP_ID,
      stepType: 'LOGIC_FUNCTION',
      position: {
        x: 260,
        y: 0,
      },
      defaultSettings: {
        input: {
          logicFunctionId: startLogicFunctionId,
        },
      },
    },
  ];

  POLLING_ATTEMPTS.forEach((attempt, index) => {
    const yOffset = 220 + index * 360;

    specs.push(
      {
        id: attempt.delayStepId,
        stepType: 'DELAY',
        position: {
          x: 260,
          y: yOffset,
        },
      },
      {
        id: attempt.completeStepId,
        stepType: 'LOGIC_FUNCTION',
        position: {
          x: 260,
          y: yOffset + 110,
        },
        defaultSettings: {
          input: {
            logicFunctionId: completeLogicFunctionId,
          },
        },
      },
    );

    if (attempt.ifStepId !== undefined) {
      specs.push({
        id: attempt.ifStepId,
        stepType: 'IF_ELSE',
        position: {
          x: 260,
          y: yOffset + 220,
        },
      });
    }
  });

  return specs;
};

const ensureWorkflowSteps = async ({
  workflowVersion,
  stepSpecs,
}: {
  workflowVersion: WorkflowVersionRecord;
  stepSpecs: WorkflowStepSpec[];
}): Promise<void> => {
  const existingStepIds = new Set(
    workflowVersion.steps?.map((step) => step.id) ?? [],
  );

  for (const stepSpec of stepSpecs) {
    if (existingStepIds.has(stepSpec.id)) {
      continue;
    }

    await createWorkflowStep({
      workflowVersionId: workflowVersion.id,
      stepType: stepSpec.stepType,
      id: stepSpec.id,
      position: stepSpec.position,
      defaultSettings: stepSpec.defaultSettings,
    });

    existingStepIds.add(stepSpec.id);
  }
};

const getWorkflowStepOrThrow = ({
  workflowVersion,
  stepId,
}: {
  workflowVersion: WorkflowVersionRecord;
  stepId: string;
}): WorkflowStepRecord => {
  const step = workflowVersion.steps?.find(
    (candidate) => candidate.id === stepId,
  );

  if (step === undefined) {
    throw new Error(`Workflow step not found: ${stepId}`);
  }

  return step;
};

const buildConfiguredStartComplianceQaStep = ({
  step,
  logicFunctionId,
}: {
  step: WorkflowStepRecord;
  logicFunctionId: string;
}): WorkflowStepRecord => ({
  ...step,
  name: 'Start Compliance QA',
  type: 'LOGIC_FUNCTION',
  valid: true,
  position: {
    x: 260,
    y: 0,
  },
  nextStepIds: [POLLING_ATTEMPTS[0].delayStepId],
  settings: {
    errorHandlingOptions: WORKFLOW_ERROR_HANDLING_OPTIONS,
    outputSchema: buildStartOutputSchema(),
    input: {
      logicFunctionId,
      logicFunctionInput: {
        callId: '{{trigger.properties.after.id}}',
      },
    },
  },
});

const buildConfiguredDelayStep = ({
  step,
  attempt,
  nextStepId,
  position,
}: {
  step: WorkflowStepRecord;
  attempt: PollingAttempt;
  nextStepId: string;
  position: WorkflowPosition;
}): WorkflowStepRecord => ({
  ...step,
  name: `Wait ${attempt.waitMinutes} minutes`,
  type: 'DELAY',
  valid: true,
  position,
  nextStepIds: [nextStepId],
  settings: {
    errorHandlingOptions: WORKFLOW_ERROR_HANDLING_OPTIONS,
    outputSchema: {},
    input: {
      delayType: 'DURATION',
      duration: {
        days: 0,
        hours: 0,
        minutes: attempt.waitMinutes,
        seconds: 0,
      },
    },
  },
});

const buildConfiguredCompleteComplianceQaStep = ({
  step,
  logicFunctionId,
  isFinalAttempt,
  nextStepIds,
  position,
}: {
  step: WorkflowStepRecord;
  logicFunctionId: string;
  isFinalAttempt: boolean;
  nextStepIds: string[];
  position: WorkflowPosition;
}): WorkflowStepRecord => ({
  ...step,
  name: isFinalAttempt
    ? 'Complete Compliance QA (final check)'
    : 'Complete Compliance QA',
  type: 'LOGIC_FUNCTION',
  valid: true,
  position,
  nextStepIds,
  settings: {
    errorHandlingOptions: WORKFLOW_ERROR_HANDLING_OPTIONS,
    outputSchema: buildCompleteOutputSchema(),
    input: {
      logicFunctionId,
      logicFunctionInput: {
        scorecardId: `{{${START_COMPLIANCE_QA_STEP_ID}.scorecardId}}`,
        isFinalAttempt,
      },
    },
  },
});

const buildConfiguredShouldPollAgainStep = ({
  step,
  attempt,
  nextDelayStepId,
  position,
}: {
  step: WorkflowStepRecord;
  attempt: Required<PollingAttempt>;
  nextDelayStepId: string;
  position: WorkflowPosition;
}): WorkflowStepRecord => {
  const ifBranch: WorkflowIfElseBranch = {
    id: attempt.ifBranchId,
    filterGroupId: attempt.filterGroupId,
    nextStepIds: [nextDelayStepId],
  };
  const elseBranch: WorkflowIfElseBranch = {
    id: attempt.elseBranchId,
    nextStepIds: [],
  };
  const stepFilterGroup: WorkflowStepFilterGroup = {
    id: attempt.filterGroupId,
    logicalOperator: 'AND',
  };
  const stepFilter: WorkflowStepFilter = {
    id: attempt.filterId,
    type: 'boolean',
    value: 'true',
    operand: 'IS',
    isFullRecord: false,
    stepOutputKey: `{{${attempt.completeStepId}.shouldPollAgain}}`,
    stepFilterGroupId: attempt.filterGroupId,
    positionInStepFilterGroup: 0,
  };

  return {
    ...step,
    name: 'Transcription still running?',
    type: 'IF_ELSE',
    valid: true,
    position,
    settings: {
      errorHandlingOptions: WORKFLOW_ERROR_HANDLING_OPTIONS,
      outputSchema: {},
      input: {
        branches: [ifBranch, elseBranch],
        stepFilterGroups: [stepFilterGroup],
        stepFilters: [stepFilter],
      },
    },
  };
};

const updateConfiguredWorkflowSteps = async ({
  workflowVersion,
  logicFunctions,
}: {
  workflowVersion: WorkflowVersionRecord;
  logicFunctions: ComplianceQaLogicFunctions;
}): Promise<void> => {
  const startStep = getWorkflowStepOrThrow({
    workflowVersion,
    stepId: START_COMPLIANCE_QA_STEP_ID,
  });

  await updateWorkflowStep({
    workflowVersionId: workflowVersion.id,
    step: buildConfiguredStartComplianceQaStep({
      step: startStep,
      logicFunctionId: logicFunctions.start.id,
    }),
  });

  for (const [index, attempt] of POLLING_ATTEMPTS.entries()) {
    const nextAttempt = POLLING_ATTEMPTS[index + 1];
    const delayStep = getWorkflowStepOrThrow({
      workflowVersion,
      stepId: attempt.delayStepId,
    });
    const completeStep = getWorkflowStepOrThrow({
      workflowVersion,
      stepId: attempt.completeStepId,
    });
    const isFinalAttempt = nextAttempt === undefined;
    const yOffset = 220 + index * 360;

    await updateWorkflowStep({
      workflowVersionId: workflowVersion.id,
      step: buildConfiguredDelayStep({
        step: delayStep,
        attempt,
        nextStepId: attempt.completeStepId,
        position: {
          x: 260,
          y: yOffset,
        },
      }),
    });

    await updateWorkflowStep({
      workflowVersionId: workflowVersion.id,
      step: buildConfiguredCompleteComplianceQaStep({
        step: completeStep,
        logicFunctionId: logicFunctions.complete.id,
        isFinalAttempt,
        nextStepIds: attempt.ifStepId === undefined ? [] : [attempt.ifStepId],
        position: {
          x: 260,
          y: yOffset + 110,
        },
      }),
    });

    if (
      nextAttempt !== undefined &&
      attempt.ifStepId !== undefined &&
      attempt.ifBranchId !== undefined &&
      attempt.elseBranchId !== undefined &&
      attempt.filterGroupId !== undefined &&
      attempt.filterId !== undefined
    ) {
      const ifStep = getWorkflowStepOrThrow({
        workflowVersion,
        stepId: attempt.ifStepId,
      });

      await updateWorkflowStep({
        workflowVersionId: workflowVersion.id,
        step: buildConfiguredShouldPollAgainStep({
          step: ifStep,
          attempt: {
            ...attempt,
            ifStepId: attempt.ifStepId,
            ifBranchId: attempt.ifBranchId,
            elseBranchId: attempt.elseBranchId,
            filterGroupId: attempt.filterGroupId,
            filterId: attempt.filterId,
          },
          nextDelayStepId: nextAttempt.delayStepId,
          position: {
            x: 260,
            y: yOffset + 220,
          },
        }),
      });
    }
  }
};

const deleteUnexpectedEmptySteps = async ({
  workflowVersionId,
}: {
  workflowVersionId: string;
}): Promise<void> => {
  const refreshedWorkflowVersion =
    await refreshWorkflowVersion(workflowVersionId);
  const expectedStepIds = new Set(getExpectedWorkflowStepIds());
  const unexpectedEmptyStepIds =
    refreshedWorkflowVersion.steps
      ?.filter((step) => step.type === 'EMPTY' && !expectedStepIds.has(step.id))
      .map((step) => step.id) ?? [];

  for (const stepId of unexpectedEmptyStepIds) {
    await deleteWorkflowStep({
      workflowVersionId,
      stepId,
    });
  }
};

const configureWorkflowVersion = async ({
  workflowVersion,
  logicFunctions,
}: {
  workflowVersion: WorkflowVersionRecord;
  logicFunctions: ComplianceQaLogicFunctions;
}): Promise<WorkflowVersionRecord> => {
  await updateWorkflowVersionTrigger({
    workflowVersionId: workflowVersion.id,
    nextStepIds: [],
  });

  const stepSpecs = buildWorkflowStepSpecs({
    startLogicFunctionId: logicFunctions.start.id,
    completeLogicFunctionId: logicFunctions.complete.id,
  });
  let refreshedWorkflowVersion = await refreshWorkflowVersion(
    workflowVersion.id,
  );

  await ensureWorkflowSteps({
    workflowVersion: refreshedWorkflowVersion,
    stepSpecs,
  });

  refreshedWorkflowVersion = await refreshWorkflowVersion(workflowVersion.id);

  await updateConfiguredWorkflowSteps({
    workflowVersion: refreshedWorkflowVersion,
    logicFunctions,
  });

  await updateWorkflowVersionTrigger({
    workflowVersionId: workflowVersion.id,
    nextStepIds: [START_COMPLIANCE_QA_STEP_ID],
  });

  await deleteUnexpectedEmptySteps({
    workflowVersionId: workflowVersion.id,
  });

  return refreshWorkflowVersion(workflowVersion.id);
};

const activateWorkflowVersion = async (
  workflowVersionId: string,
): Promise<void> => {
  const response = await graphqlRequest<ActivateWorkflowVersionResponse>({
    tokenType: 'workspace',
    variables: {
      workflowVersionId,
    },
    query: `
      mutation ActivateComplianceQaWorkflow($workflowVersionId: UUID!) {
        activateWorkflowVersion(workflowVersionId: $workflowVersionId)
      }
    `,
  });

  if (!response.activateWorkflowVersion) {
    throw new Error('Compliance QA workflow activation returned false.');
  }
};

const configureComplianceWorkflow = async (): Promise<PostInstallResult> => {
  const logicFunctions = await findComplianceQaLogicFunctions();
  const state = await getWorkflowStateAfterCreate();

  if (state.workflow === null) {
    throw new Error('Compliance QA workflow was not created.');
  }

  if (state.workflow.statuses?.includes('ACTIVE') === true) {
    const activeVersion = getActiveVersion(state.workflow, state.versions);

    if (activeVersion === null) {
      return {
        workflowId: state.workflow.id,
        status: 'left-unchanged',
        message:
          `${COMPLIANCE_QA_WORKFLOW_NAME} is active but has no active version. ` +
          'Compliance left it unchanged.',
      };
    }

    if (isConfiguredComplianceWorkflowVersion(activeVersion)) {
      return {
        workflowId: state.workflow.id,
        workflowVersionId: activeVersion.id,
        status: 'already-active',
        message: `${COMPLIANCE_QA_WORKFLOW_NAME} is already active.`,
      };
    }

    const draftVersion = await createDraftFromWorkflowVersion({
      workflowId: state.workflow.id,
      workflowVersionIdToCopy: activeVersion.id,
    });
    const configuredWorkflowVersion = await configureWorkflowVersion({
      workflowVersion: draftVersion,
      logicFunctions,
    });

    await activateWorkflowVersion(configuredWorkflowVersion.id);

    return {
      workflowId: state.workflow.id,
      workflowVersionId: configuredWorkflowVersion.id,
      status: 'updated',
      message:
        `${COMPLIANCE_QA_WORKFLOW_NAME} was updated to use workflow-owned ` +
        'transcription polling and activated.',
    };
  }

  const draftVersion = getDraftVersion(state.versions);

  if (draftVersion === null) {
    return {
      workflowId: state.workflow.id,
      status: 'left-unchanged',
      message:
        `${COMPLIANCE_QA_WORKFLOW_NAME} exists but has no draft version. ` +
        'Compliance left it unchanged to avoid reactivating a workflow an admin may have disabled.',
    };
  }

  const configuredWorkflowVersion = await configureWorkflowVersion({
    workflowVersion: draftVersion,
    logicFunctions,
  });

  await activateWorkflowVersion(configuredWorkflowVersion.id);

  return {
    workflowId: state.workflow.id,
    workflowVersionId: configuredWorkflowVersion.id,
    status: 'created',
    message: `${COMPLIANCE_QA_WORKFLOW_NAME} was created and activated.`,
  };
};

const handler = async (_payload: InstallPayload): Promise<PostInstallResult> =>
  configureComplianceWorkflow();

export default definePostInstallLogicFunction({
  universalIdentifier: '9df4313f-5f88-4a07-9152-621ac9ad07b1',
  name: 'post-install',
  description:
    'Creates the visible Compliance Call Pipeline workflow after app install.',
  timeoutSeconds: 120,
  shouldRunOnVersionUpgrade: true,
  shouldRunSynchronously: true,
  handler,
});
