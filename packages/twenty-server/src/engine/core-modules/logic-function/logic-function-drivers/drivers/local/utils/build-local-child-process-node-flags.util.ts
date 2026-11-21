export const buildLocalChildProcessNodeFlags = ({
  readableDirectories,
  writableDirectory,
  shouldAllowNetwork,
}: {
  readableDirectories: string[];
  writableDirectory: string;
  shouldAllowNetwork: boolean;
}): string[] => [
  '--permission',
  // OMNIA-CUSTOM: no --allow-addons. Native code escapes the permission model and could read the pod's
  // secrets and Pod Identity token; Omnia's apps (AWS SDK, twenty-sdk) load no addons.
  '--disable-warning=SecurityWarning',
  ...(shouldAllowNetwork
    ? ['--allow-net', '--disable-warning=ExperimentalWarning']
    : []),
  ...readableDirectories.map(
    (readableDirectory) => `--allow-fs-read=${readableDirectory}`,
  ),
  `--allow-fs-write=${writableDirectory}`,
];
