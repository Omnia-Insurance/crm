import { THEME_COMMON } from '@ui/theme';
import { ThemeContext } from '@ui/theme-constants';
import { useContext } from 'react';

import styles from './AudioLink.module.scss';

type AudioLinkProps = {
  src: string;
};

// OMNIA-CUSTOM: audio player for call-recording playback. Uses SCSS modules +
// inline theme styles (twenty-ui dropped Linaria/wyw in the v2.19 merge, so a
// `styled` component here would ship a runtime stub and crash at import time).
const spacing1 = THEME_COMMON.spacing(1);

export const AudioLink = ({ src }: AudioLinkProps) => {
  const { theme } = useContext(ThemeContext);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className={styles.audioContainer}
      style={{
        backgroundColor: theme.background.transparent.lighter,
        border: `1px solid ${theme.border.color.strong}`,
        padding: spacing1,
      }}
      onClick={handleClick}
    >
      <audio className={styles.audio} controls preload="none">
        <source src={src} type="audio/mpeg" />
      </audio>
    </div>
  );
};
