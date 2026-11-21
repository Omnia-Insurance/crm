import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { type MouseEvent } from 'react';
import { getSafeUrl, isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

type AudioLinkProps = {
  src: string;
};

const StyledAudioContainer = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.strong};
  border-radius: ${themeCssVariables.border.radius.pill};
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  padding: ${themeCssVariables.spacing[1]};
`;

const StyledAudio = styled.audio`
  height: ${themeCssVariables.spacing[6]};
  max-width: 160px;

  &::-webkit-media-controls-panel {
    background: transparent;
  }
`;

export const AudioLink = ({ src }: AudioLinkProps) => {
  const { t } = useLingui();
  const safeSrc = getSafeUrl(src);

  if (!isDefined(safeSrc)) {
    return null;
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  // src on the element, not a <source> child: a reused player must reload
  // when the recording changes instead of replaying the previous one.
  return (
    <StyledAudioContainer onClick={handleClick}>
      <StyledAudio
        aria-label={t`Call recording`}
        controls
        preload="none"
        src={safeSrc}
      />
    </StyledAudioContainer>
  );
};
