import { Fragment, useContext, useEffect, useRef, useState } from 'react';

import { RecordDetailRecordsListContainer } from '@/object-record/record-field-list/record-detail-section/components/RecordDetailRecordsListContainer';
import { RecordDetailRelationRecordsListItem } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItem';
import { RecordDetailRelationRecordsListItemEffect } from '@/object-record/record-field-list/record-detail-section/relation/components/RecordDetailRelationRecordsListItemEffect';
import { DraftRelatedViolationsContext } from '@/object-record/record-field/ui/contexts/DraftRelatedViolationsContext';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

type RecordDetailRelationRecordsListProps = {
  objectNameSingular: string;
  value: ObjectRecord;
  fieldMetadataId: string;
};

export const RecordDetailRelationRecordsList = ({
  recordsWithObjectNameSingular,
}: {
  recordsWithObjectNameSingular: RecordDetailRelationRecordsListProps[];
}) => {
  const [expandedItem, setExpandedItem] = useState('');
  const expandedByViolationsRef = useRef<string | null>(null);

  const relatedViolations = useContext(DraftRelatedViolationsContext);

  // Auto-expand when a related record has required field violations
  useEffect(() => {
    const violatedRecordId = recordsWithObjectNameSingular.find((r) =>
      relatedViolations.some(
        (rv) =>
          rv.relatedRecordId === r.value.id && rv.violations.length > 0,
      ),
    )?.value.id;

    if (violatedRecordId && expandedItem !== violatedRecordId) {
      setExpandedItem(violatedRecordId);
      expandedByViolationsRef.current = violatedRecordId;
    }

    // Auto-collapse if we expanded it for violations and they're now resolved
    if (
      expandedByViolationsRef.current &&
      expandedItem === expandedByViolationsRef.current &&
      !relatedViolations.some(
        (rv) =>
          rv.relatedRecordId === expandedByViolationsRef.current &&
          rv.violations.length > 0,
      )
    ) {
      setExpandedItem('');
      expandedByViolationsRef.current = null;
    }
  }, [relatedViolations, recordsWithObjectNameSingular, expandedItem]);

  const handleItemClick = (recordId: string) =>
    setExpandedItem(recordId === expandedItem ? '' : recordId);

  return (
    <RecordDetailRecordsListContainer>
      {recordsWithObjectNameSingular
        .slice(0, 5)
        .map((recordWithObjectNameSingular) => (
          <Fragment
            key={`${recordWithObjectNameSingular.value.id}-${recordWithObjectNameSingular.fieldMetadataId}`}
          >
            <RecordDetailRelationRecordsListItemEffect
              key={`${recordWithObjectNameSingular.value.id}-effect`}
              relationRecordId={recordWithObjectNameSingular.value.id}
              relationObjectMetadataNameSingular={
                recordWithObjectNameSingular.objectNameSingular
              }
            />
            <RecordDetailRelationRecordsListItem
              key={recordWithObjectNameSingular.value.id}
              isExpanded={
                expandedItem === recordWithObjectNameSingular.value.id
              }
              onClick={handleItemClick}
              relationRecord={recordWithObjectNameSingular.value}
              relationObjectMetadataNameSingular={
                recordWithObjectNameSingular.objectNameSingular
              }
              relationFieldMetadataId={
                recordWithObjectNameSingular.fieldMetadataId
              }
            />
          </Fragment>
        ))}
    </RecordDetailRecordsListContainer>
  );
};
