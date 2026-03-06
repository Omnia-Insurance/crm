import { type FieldDateMetadataSettings } from '@/object-record/record-field/ui/types/FieldMetadata';
import { TimeZoneAbbreviation } from '@/ui/input/components/internal/date/components/TimeZoneAbbreviation';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { UserContext } from '@/users/contexts/UserContext';
import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { useContext } from 'react';
import { Temporal } from 'temporal-polyfill';
import { dateLocaleState } from '~/localization/states/dateLocaleState';
import { formatDateTimeString } from '~/utils/string/formatDateTimeString';
import { EllipsisDisplay } from './EllipsisDisplay';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTimeZoneSpacer = styled.span`
  min-width: ${themeCssVariables.spacing[1]};
`;

type DateTimeDisplayProps = {
  value: string | null | undefined;
  dateFieldSettings?: FieldDateMetadataSettings;
};

export const DateTimeDisplay = ({
  value,
  dateFieldSettings,
}: DateTimeDisplayProps) => {
  const { dateFormat, timeFormat, timeZone } = useContext(UserContext);
  const dateLocale = useAtomStateValue(dateLocaleState);

  const formattedDate = formatDateTimeString({
    value,
    timeZone,
    dateFormat,
    timeFormat,
    dateFieldSettings,
    localeCatalog: dateLocale.localeCatalog,
  });

  return (
    <EllipsisDisplay>
      {formattedDate}
      <span></span>
      {isNonEmptyString(value) &&
        (() => {
          try {
            const instant = Temporal.Instant.from(
              // eslint-disable-next-line lingui/no-unlocalized-strings
              value.includes('T') ? value : `${value}T00:00:00Z`,
            );
            return (
              <>
                <StyledTimeZoneSpacer />
                <TimeZoneAbbreviation instant={instant} />
              </>
            );
          } catch {
            return null;
          }
        })()}
    </EllipsisDisplay>
  );
};
