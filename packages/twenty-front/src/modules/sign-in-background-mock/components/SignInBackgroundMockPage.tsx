import { t } from '@lingui/core/macro';
import { styled } from '@linaria/react';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { SignInBackgroundMockContainer } from '@/sign-in-background-mock/components/SignInBackgroundMockContainer';
import { SIGN_IN_BACKGROUND_MOCK_CONFIG } from '@/sign-in-background-mock/constants/SignInBackgroundMockConfig';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { PageHeader } from '@/ui/layout/page/components/PageHeader';
import { isDefined } from 'twenty-shared/utils';
import { IconUser, useIcons } from 'twenty-ui/display';

const StyledTableContainer = styled.div`
  display: flex;
  height: 100%;
  width: 100%;
`;

export const SignInBackgroundMockPage = () => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNameSingular,
  });
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
