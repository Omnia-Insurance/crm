import { type CodeInterpreterService } from 'src/engine/core-modules/code-interpreter/code-interpreter.service';
import { type I18nService } from 'src/engine/core-modules/i18n/i18n.service';
import { COMMON_PRELOAD_TOOLS } from 'src/engine/core-modules/tool-provider/constants/common-preload-tools.const';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { ActionToolProvider } from 'src/engine/core-modules/tool-provider/providers/action-tool.provider';
import { type CreateCalendarEventTool } from 'src/engine/core-modules/tool/tools/calendar-tool/create-calendar-event-tool';
import { type CodeInterpreterTool } from 'src/engine/core-modules/tool/tools/code-interpreter-tool/code-interpreter-tool';
import { type DraftEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/draft-email-tool';
import { type FindConnectedAccountsTool } from 'src/engine/core-modules/tool/tools/email-tool/find-connected-accounts-tool';
import { type SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { type CompleteFileUploadTool } from 'src/engine/core-modules/tool/tools/file-upload-tool/complete-file-upload-tool';
import { type CreateFileUploadTool } from 'src/engine/core-modules/tool/tools/file-upload-tool/create-file-upload-tool';
import { type HttpTool } from 'src/engine/core-modules/tool/tools/http-tool/http-tool';
import { type ExtractJsonPathsTool } from 'src/engine/core-modules/tool/tools/output-navigation-tool/extract-json-paths-tool';
import { type SearchOutputTool } from 'src/engine/core-modules/tool/tools/output-navigation-tool/search-output-tool';
import { type SearchHelpCenterTool } from 'src/engine/core-modules/tool/tools/search-help-center-tool/search-help-center-tool';
import { type ShareRecordTool } from 'src/engine/core-modules/tool/tools/share-record-tool/share-record-tool';
import { type SettingPermissionsService } from 'src/engine/permissions/setting-permissions.service';
import { type SaveCampaignTool } from 'src/modules/emailing/tools/save-campaign-tool';

const buildTool = <TTool>() => ({ description: 'tool' }) as unknown as TTool;

const buildProvider = ({
  hasEveryPermissionFlag,
}: {
  hasEveryPermissionFlag: boolean;
}) =>
  new ActionToolProvider(
    buildTool<HttpTool>(),
    buildTool<SendEmailTool>(),
    buildTool<DraftEmailTool>(),
    buildTool<FindConnectedAccountsTool>(),
    buildTool<CreateCalendarEventTool>(),
    buildTool<SearchHelpCenterTool>(),
    buildTool<CreateFileUploadTool>(),
    buildTool<CompleteFileUploadTool>(),
    buildTool<CodeInterpreterTool>(),
    buildTool<ExtractJsonPathsTool>(),
    buildTool<SearchOutputTool>(),
    buildTool<SaveCampaignTool>(),
    {
      description: 'tool',
      isEnabled: jest.fn().mockResolvedValue(true),
    } as unknown as ShareRecordTool,
    {
      isEnabled: () => true,
    } as unknown as CodeInterpreterService,
    {
      hasPermissionFlag: jest.fn().mockResolvedValue(hasEveryPermissionFlag),
    } as unknown as SettingPermissionsService,
    {
      translateMessage: ({ messageId }: { messageId: string }) => messageId,
    } as unknown as I18nService,
  );

const CONTEXT = { workspaceId: 'workspace-id' } as ToolProviderContext;

// OMNIA-CUSTOM: the docs search would send a model-written query (which can quote PHI) to docs.twenty.com
describe('ActionToolProvider (Omnia)', () => {
  it.each([true, false])(
    'never offers search_help_center (every permission flag granted: %s)',
    async (hasEveryPermissionFlag) => {
      const descriptors = await buildProvider({
        hasEveryPermissionFlag,
      }).generateDescriptors(CONTEXT, { includeSchemas: false });

      expect(descriptors.map(({ name }) => name)).not.toContain(
        'search_help_center',
      );
      expect(descriptors.map(({ name }) => name)).toContain('search_output');
    },
  );

  it('preloads no help center search', () => {
    expect(COMMON_PRELOAD_TOOLS).not.toContain('search_help_center');
  });
});
