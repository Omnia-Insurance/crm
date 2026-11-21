import { type MouseEvent, type ReactNode } from 'react';

import { widgetCardHoveredComponentFamilyState } from '@/page-layout/widgets/states/widgetCardHoveredComponentFamilyState';
import { widgetHeaderCountComponentFamilyState } from '@/page-layout/widgets/states/widgetHeaderCountComponentFamilyState';
import { type WidgetCardVariant } from '@/page-layout/widgets/types/WidgetCardVariant';
import { WidgetCardHeader } from '@/page-layout/widgets/widget-card/components/WidgetCardHeader';
import { WidgetCardHeaderActionsRenderer } from '@/page-layout/widgets/widget-card/components/WidgetCardHeaderActionsRenderer';
// OMNIA-CUSTOM: red title for an empty required field widget (contract C5)
import { useWidgetCardIsRequiredEmpty } from '@/page-layout/widgets/widget-card/hooks/useWidgetCardIsRequiredEmpty';
import { useAtomComponentFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateValue';

type PageLayoutWidgetCardHeaderProps = {
  widgetId: string;
  variant: WidgetCardVariant;
  isInEditMode: boolean;
  hasAccess?: boolean;
  isResizing?: boolean;
  title: string;
  onRemove?: (e?: MouseEvent) => void;
  forbiddenDisplay?: ReactNode;
  className?: string;
  // OMNIA-CUSTOM: set for FIELD widgets, whose title turns red when the field is required and empty
  fieldMetadataId?: string;
};

export const PageLayoutWidgetCardHeader = ({
  widgetId,
  variant,
  isInEditMode,
  hasAccess = true,
  isResizing,
  title,
  onRemove,
  forbiddenDisplay,
  className,
  fieldMetadataId,
}: PageLayoutWidgetCardHeaderProps) => {
  const widgetCardHovered = useAtomComponentFamilyStateValue(
    widgetCardHoveredComponentFamilyState,
    widgetId,
  );
  const widgetHeaderCount = useAtomComponentFamilyStateValue(
    widgetHeaderCountComponentFamilyState,
    widgetId,
  );

  // OMNIA-CUSTOM: red title for an empty required field widget (contract C5)
  const isRequiredEmpty = useWidgetCardIsRequiredEmpty(fieldMetadataId);

  return (
    <WidgetCardHeader
      className={className}
      variant={variant}
      isInEditMode={isInEditMode}
      isHovered={widgetCardHovered}
      count={widgetHeaderCount}
      actions={hasAccess && <WidgetCardHeaderActionsRenderer />}
      isResizing={isResizing}
      title={title}
      onRemove={onRemove}
      forbiddenDisplay={forbiddenDisplay}
      isRequiredEmpty={isRequiredEmpty}
    />
  );
};
