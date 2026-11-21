import { useLingui } from '@lingui/react/macro';
import React, { useMemo } from 'react';

import { getFieldLinkDefinedLinks } from '@/object-record/record-field/ui/meta-types/input/utils/getFieldLinkDefinedLinks';
import { type FieldLinksValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { SocialLink } from '@/ui/field/display/components/SocialLink/SocialLink';
import { OverflowingList } from 'twenty-ui/components/layout';
import {
  getAbsoluteUrlOrThrow,
  getUrlHostnameOrThrow,
  isDefined,
} from 'twenty-shared/utils';
import { RoundedLink } from '@/ui/navigation/link/components/RoundedLink/RoundedLink';
import { AudioLink } from '@/ui/navigation/link/components/AudioLink/AudioLink';
import { checkUrlType } from '@/ui/field/display/utils/checkUrlType';
import { isSocialLinkType } from '@/ui/field/display/utils/isSocialLinkType';

type LinksDisplayProps = {
  value?: FieldLinksValue;
  onLinkClick?: (url: string, event: React.MouseEvent<HTMLElement>) => void;
  // OMNIA-CUSTOM: 'audio' renders each link as an inline player (call recordings)
  displayAs?: 'link' | 'audio';
};

export const LinksDisplay = ({
  value,
  onLinkClick,
  displayAs,
}: LinksDisplayProps) => {
  const { t } = useLingui();

  const links = useMemo(() => {
    if (!isDefined(value)) {
      return [];
    }

    return getFieldLinkDefinedLinks(value).map(({ url, label }) => {
      let absoluteUrl = '';
      let hostname = '';
      try {
        absoluteUrl = getAbsoluteUrlOrThrow(url);
        hostname = getUrlHostnameOrThrow(absoluteUrl);
      } catch {
        absoluteUrl = '';
        hostname = '';
      }
      return {
        url: absoluteUrl,
        label,
        displayLabel: label || hostname,
        type: checkUrlType(absoluteUrl),
      };
    });
  }, [value]);

  return (
    <OverflowingList overflowLabel={t`Show all items`}>
      {links.map(({ url, label, displayLabel, type }, index) =>
        // OMNIA-CUSTOM: call recordings play inline instead of opening a link
        displayAs === 'audio' ? (
          <AudioLink key={index} src={url} />
        ) : isSocialLinkType(type) ? (
          <SocialLink
            key={index}
            href={url}
            type={type}
            label={label}
            onClick={(event) => onLinkClick?.(url, event)}
          />
        ) : (
          <RoundedLink
            key={index}
            href={url}
            label={displayLabel}
            onClick={(event) => onLinkClick?.(url, event)}
          />
        ),
      )}
    </OverflowingList>
  );
};
