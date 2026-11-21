import { gql } from '@apollo/client';

export const REFRESH_OMNIA_SIBLING_SESSION = gql`
  mutation RefreshOmniaSiblingSession {
    refreshOmniaSiblingSession
  }
`;
