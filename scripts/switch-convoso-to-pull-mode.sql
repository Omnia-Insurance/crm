-- Switch Convoso Call Pipeline from push (webhook) to pull (cron polling)
-- The Convoso Connect webhook sends lead data, not call data.
-- Pull mode polls the Convoso Call Log API (/v1/log/retrieve) on a 5-min cron.

UPDATE core."ingestionPipeline"
SET mode = 'pull',
    "sourceUrl" = 'https://api.convoso.com/v1/log/retrieve',
    "sourceAuthConfig" = '{"type":"query_param","paramName":"auth_token","envVar":"CONVOSO_API_TOKEN"}',
    "sourceRequestConfig" = '{"queryParams":{"include_recordings":"1"},"dateRangeParams":{"startParam":"start_time","endParam":"end_time","lookbackMinutes":120,"timezone":"America/Los_Angeles"}}',
    "responseRecordsPath" = 'data.results',
    "paginationConfig" = '{"type":"offset","paramName":"offset","pageSize":500}',
    schedule = '*/5 * * * *',
    "webhookSecret" = NULL
WHERE id = '2a37853a-ae46-4d52-8389-604150597808';
