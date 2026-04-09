import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useRelevantRecordsGqlFields } from '@/object-record/record-field/hooks/useRelevantRecordsGqlFields';
import { useFindManyRecordIndexTableParams } from '@/object-record/record-index/hooks/useFindManyRecordIndexTableParams';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { SIGN_IN_BACKGROUND_MOCK_CONFIG } from '@/sign-in-background-mock/constants/SignInBackgroundMockConfig';
import { SIGN_IN_BACKGROUND_MOCK_RECORDS } from '@/sign-in-background-mock/constants/SignInBackgroundMockRecords';
import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';

export const useRecordIndexTableQuery = (objectNameSingular: string) => {
  const showAuthModal = useShowAuthModal();
  const { recordTableId } = useRecordTableContextOrThrow();
  const isSignInBackgroundMock =
    showAuthModal &&
    recordTableId === SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId &&
    objectNameSingular === SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNameSingular;

  const params = useFindManyRecordIndexTableParams(objectNameSingular);

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const recordGqlFields = useRelevantRecordsGqlFields({
    objectMetadataItem,
  });

  const {
    records,
    hasNextPage,
    queryIdentifier,
    loading,
    totalCount,
    fetchMoreRecords,
  } = useFindManyRecords({
    ...params,
    recordGqlFields,
    skip: isSignInBackgroundMock,
  });

  return {
    records: isSignInBackgroundMock ? SIGN_IN_BACKGROUND_MOCK_RECORDS : records,
    loading: isSignInBackgroundMock ? false : loading,
    hasNextPage: isSignInBackgroundMock ? false : hasNextPage,
    queryIdentifier,
    totalCount: isSignInBackgroundMock
      ? SIGN_IN_BACKGROUND_MOCK_RECORDS.length
      : totalCount,
    fetchMoreRecords: isSignInBackgroundMock
      ? async () => undefined
      : fetchMoreRecords,
  };
};
