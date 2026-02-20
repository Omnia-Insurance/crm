import { styled } from '@linaria/react';
import { THEME_COMMON, ThemeContext } from '@ui/theme';
import { useContext } from 'react';

type AudioLinkProps = {
  src: string;
};

const spacing1 = THEME_COMMON.spacing(1);

const StyledAudioContainer = styled.div<{
  background: string;
  border: string;
}>`
  align-items: center;
  background-color: ${({ background }) => background};
  border: 1px solid ${({ border }) => border};
  border-radius: 50px;
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  padding: ${spacing1};
`;

const StyledAudio = styled.audio`
  height: 24px;
  max-width: 160px;

  &::-webkit-media-controls-panel {
    background: transparent;
  }
`;

export const AudioLink = ({ src }: AudioLinkProps) => {
  const { theme } = useContext(ThemeContext);

  const background = theme.background.transparent.lighter;
  const border = theme.border.color.strong;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <StyledAudioContainer
      background={background}
      border={border}
      onClick={handleClick}
    >
      <StyledAudio controls preload="none">
        <source src={src} type="audio/mpeg" />
      </StyledAudio>
    </StyledAudioContainer>
  );
};
