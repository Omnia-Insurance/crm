export type BearerAuthConfig = {
  type: 'bearer';
  token: string;
};

export type ApiKeyAuthConfig = {
  type: 'api_key';
  headerName: string;
  key: string;
};

export type QueryParamAuthConfig = {
  type: 'query_param';
  paramName: string;
  value: string;
};

export type BasicAuthConfig = {
  type: 'basic';
  username: string;
  password: string;
};

export type SourceAuthConfig =
  | BearerAuthConfig
  | ApiKeyAuthConfig
  | QueryParamAuthConfig
  | BasicAuthConfig;
