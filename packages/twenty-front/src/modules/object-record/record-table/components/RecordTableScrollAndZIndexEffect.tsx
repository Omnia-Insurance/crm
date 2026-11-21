import { RECORD_TABLE_HORIZONTAL_SCROLL_SHADOW_VISIBILITY_CSS_VARIABLE_NAME } from '@/object-record/record-table/constants/RecordTableHorizontalScrollShadowVisibilityCssVariableName';
import { RECORD_TABLE_VERTICAL_SCROLL_SHADOW_VISIBILITY_CSS_VARIABLE_NAME } from '@/object-record/record-table/constants/RecordTableVerticalScrollShadowVisibilityCssVariableName';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { isRecordTableScrolledHorizontallyComponentState } from '@/object-record/record-table/states/isRecordTableScrolledHorizontallyComponentState';
import { isRecordTableScrolledVerticallyComponentState } from '@/object-record/record-table/states/isRecordTableScrolledVerticallyComponentState';
import { updateRecordTableCSSVariable } from '@/object-record/record-table/utils/updateRecordTableCSSVariable';

import { useScrollWrapperHTMLElement } from '@/ui/utilities/scroll/hooks/useScrollWrapperHTMLElement';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';

import { useStore } from 'jotai';
import { useEffect } from 'react';
import { isDefined } from 'twenty-shared/utils';

export const RecordTableScrollAndZIndexEffect = () => {
  const { recordTableId } = useRecordTableContextOrThrow();
  const { scrollWrapperHTMLElement } = useScrollWrapperHTMLElement();

  // OMNIA-CUSTOM: the flags go through store.get/set so the listener is attached once. Re-attaching it on every
  // flag flip crash-looped mobile Safari during momentum scrolling
  const store = useStore();

  const isRecordTableScrolledHorizontallyCallbackState =
    useAtomComponentStateCallbackState(
      isRecordTableScrolledHorizontallyComponentState,
    );

  const isRecordTableScrolledVerticallyCallbackState =
    useAtomComponentStateCallbackState(
      isRecordTableScrolledVerticallyComponentState,
    );

  useEffect(() => {
    if (!isDefined(scrollWrapperHTMLElement)) {
      return;
    }

    const handleScroll = (event: Event) => {
      const target = event.currentTarget as HTMLElement;

      const newIsScrolledVertically = target.scrollTop > 0;

      if (
        newIsScrolledVertically !==
        store.get(isRecordTableScrolledVerticallyCallbackState)
      ) {
        store.set(
          isRecordTableScrolledVerticallyCallbackState,
          newIsScrolledVertically,
        );

        updateRecordTableCSSVariable(
          recordTableId,
          RECORD_TABLE_VERTICAL_SCROLL_SHADOW_VISIBILITY_CSS_VARIABLE_NAME,
          newIsScrolledVertically ? 'visible' : 'hidden',
        );
      }

      const newIsScrolledHorizontally = target.scrollLeft > 0;

      if (
        newIsScrolledHorizontally !==
        store.get(isRecordTableScrolledHorizontallyCallbackState)
      ) {
        store.set(
          isRecordTableScrolledHorizontallyCallbackState,
          newIsScrolledHorizontally,
        );

        updateRecordTableCSSVariable(
          recordTableId,
          RECORD_TABLE_HORIZONTAL_SCROLL_SHADOW_VISIBILITY_CSS_VARIABLE_NAME,
          newIsScrolledHorizontally ? 'visible' : 'hidden',
        );
      }
    };

    scrollWrapperHTMLElement.addEventListener('scroll', handleScroll, {
      passive: true,
    });

    return () => {
      scrollWrapperHTMLElement.removeEventListener('scroll', handleScroll);
    };
  }, [
    recordTableId,
    scrollWrapperHTMLElement,
    store,
    isRecordTableScrolledVerticallyCallbackState,
    isRecordTableScrolledHorizontallyCallbackState,
  ]);

  return <></>;
};
