import { DomainShell } from '@/app/components/DomainShell';
import { I18nActivationGate } from '@/app/components/I18nActivationGate';
import { LocaleDirectionProvider } from '@/app/components/LocaleDirectionProvider';
import { ApolloDevLogEffect } from '@/apollo/components/ApolloDevLogEffect';
import { AppErrorBoundary } from '@/error-handler/components/AppErrorBoundary';
import { AppRootErrorFallback } from '@/error-handler/components/AppRootErrorFallback';
import { ExceptionHandlerProvider } from '@/error-handler/components/ExceptionHandlerProvider';
import { ClickOutsideListenerContext } from '@/ui/utilities/pointer-event/contexts/ClickOutsideListenerContext';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Provider as JotaiProvider } from 'jotai';
import { lazy, Suspense } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { ToastProvider } from 'twenty-ui/components/feedback';
import { IconsProvider } from 'twenty-ui/icon/provider';
import { initialI18nActivate } from '~/utils/i18n/initialI18nActivate';

initialI18nActivate();

// OMNIA-CUSTOM: dev-only Agentation annotation toolbar. Production builds fold
// the condition to null, so the package is never bundled or loaded.
const Agentation =
  process.env.NODE_ENV === 'development'
    ? lazy(() =>
        import('agentation').then((module) => ({
          default: module.Agentation,
        })),
      )
    : null;

export const App = () => {
  return (
    <JotaiProvider store={jotaiStore}>
      <AppErrorBoundary
        resetOnLocationChange={false}
        FallbackComponent={AppRootErrorFallback}
      >
        <I18nActivationGate>
          <I18nProvider i18n={i18n}>
            <LocaleDirectionProvider>
              <ApolloDevLogEffect />
              <ToastProvider>
                <IconsProvider>
                  <ExceptionHandlerProvider>
                    <HelmetProvider>
                      <ClickOutsideListenerContext.Provider
                        value={{ excludedClickOutsideId: undefined }}
                      >
                        <DomainShell />
                        {isDefined(Agentation) && (
                          <Suspense fallback={null}>
                            <Agentation />
                          </Suspense>
                        )}
                      </ClickOutsideListenerContext.Provider>
                    </HelmetProvider>
                  </ExceptionHandlerProvider>
                </IconsProvider>
              </ToastProvider>
            </LocaleDirectionProvider>
          </I18nProvider>
        </I18nActivationGate>
      </AppErrorBoundary>
    </JotaiProvider>
  );
};
