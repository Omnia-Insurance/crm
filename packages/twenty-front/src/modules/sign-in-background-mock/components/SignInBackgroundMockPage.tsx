import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';

import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { SignInBackgroundMockContainer } from '@/sign-in-background-mock/components/SignInBackgroundMockContainer';
import { SIGN_IN_BACKGROUND_MOCK_CONFIG } from '@/sign-in-background-mock/constants/SignInBackgroundMockConfig';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { isDefined } from 'twenty-shared/utils';
import { IconUser, useIcons } from 'twenty-ui/display';

const StyledTableContainer = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
`;

export const SignInBackgroundMockPage = () => {
  // OMNIA-CUSTOM: use the safe selector so a signed-out visitor with empty
  // metadata renders a blank shell instead of crashing the error boundary.
  const objectMetadataItem = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    {
      objectName: SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNameSingular,
      objectNameType: 'singular',
    },
  );
  const { getIcon } = useIcons();
  const ObjectIcon = isDefined(objectMetadataItem)
    ? getIcon(objectMetadataItem.icon)
    : IconUser;

  return (
    <PageContainer>
      <PageHeader
        title={objectMetadataItem?.labelPlural ?? t`Leads`}
        Icon={ObjectIcon}
      />
      <PageBody>
        <StyledTableContainer>
          <SignInBackgroundMockContainer />
        </StyledTableContainer>
      </PageBody>
    </PageContainer>
  );
};
