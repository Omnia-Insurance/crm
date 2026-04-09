import { useEffect } from 'react';

import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { SIGN_IN_BACKGROUND_MOCK_TABLE } from '@/sign-in-background-mock/constants/SignInBackgroundMockColumnDefinitions';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { useAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { availableFieldDefinitionsComponentState } from '@/views/states/availableFieldDefinitionsComponentState';
import { viewObjectMetadataIdComponentState } from '@/views/states/viewObjectMetadataIdComponentState';

type SignInBackgroundMockContainerEffectProps = {
  objectMetadataItemId: string;
  recordTableId: string;
  viewBarId: string;
};

export const SignInBackgroundMockContainerEffect = ({
  objectMetadataItemId,
  recordTableId,
  viewBarId,
}: SignInBackgroundMockContainerEffectProps) => {
  const [currentRecordFields, setCurrentRecordFields] = useAtomComponentState(
    currentRecordFieldsComponentState,
    recordTableId,
  );
  const [availableFieldDefinitions, setAvailableFieldDefinitions] =
    useAtomComponentState(availableFieldDefinitionsComponentState, viewBarId);
  const [viewObjectMetadataId, setViewObjectMetadataId] = useAtomComponentState(
    viewObjectMetadataIdComponentState,
    viewBarId,
  );

  const setIsNavigationDrawerExpanded = useSetAtomState(
    isNavigationDrawerExpandedState,
  );

  useEffect(() => {
    setIsNavigationDrawerExpanded(true);
  }, [setIsNavigationDrawerExpanded]);

  useEffect(() => {
    if (viewObjectMetadataId !== objectMetadataItemId) {
      setViewObjectMetadataId(objectMetadataItemId);
    }
  }, [objectMetadataItemId, setViewObjectMetadataId, viewObjectMetadataId]);

  useEffect(() => {
    if (
      availableFieldDefinitions !==
      SIGN_IN_BACKGROUND_MOCK_TABLE.columnDefinitions
    ) {
      setAvailableFieldDefinitions(
        SIGN_IN_BACKGROUND_MOCK_TABLE.columnDefinitions,
      );
    }
  }, [availableFieldDefinitions, setAvailableFieldDefinitions]);

  useEffect(() => {
    if (currentRecordFields !== SIGN_IN_BACKGROUND_MOCK_TABLE.recordFields) {
      setCurrentRecordFields(SIGN_IN_BACKGROUND_MOCK_TABLE.recordFields);
    }
  }, [currentRecordFields, setCurrentRecordFields]);

  return <></>;
};
