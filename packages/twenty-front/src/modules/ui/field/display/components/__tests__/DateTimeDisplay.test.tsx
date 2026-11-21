import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { DateFormat } from '@/localization/constants/DateFormat';
import { TimeFormat } from '@/localization/constants/TimeFormat';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';
import { UserContext } from '@/users/contexts/UserContext';

const USER_TIME_ZONE = 'America/New_York';

// A workspace member timezone that differs from the system one makes the
// display render the timezone abbreviation, which parses the value as an instant
const renderDateTime = (value: string) => {
  const store = createStore();

  store.set(currentWorkspaceMemberState.atom, {
    id: 'workspace-member-id',
    name: { firstName: 'Dana', lastName: 'Reyes' },
    colorScheme: 'Light',
    locale: 'en-US',
    userEmail: 'dana@example.com',
    timeZone: USER_TIME_ZONE,
    dateFormat: null,
    timeFormat: null,
    numberFormat: null,
    calendarStartDay: null,
  });

  return render(
    <JotaiProvider store={store}>
      <UserContext.Provider
        value={{
          dateFormat: DateFormat.MONTH_FIRST,
          timeFormat: TimeFormat.HOUR_24,
          timeZone: USER_TIME_ZONE,
        }}
      >
        <DateTimeDisplay value={value} />
      </UserContext.Provider>
    </JotaiProvider>,
  );
};

// OMNIA-CUSTOM: legacy DATE_TIME values can be date-only or malformed
describe('DateTimeDisplay', () => {
  it('renders a date-time with the timezone abbreviation', () => {
    renderDateTime('2026-03-04T15:30:00.000Z');

    expect(screen.getByText('Mar 4, 2026 10:30')).toBeInTheDocument();
    expect(screen.getByText('EST')).toBeInTheDocument();
  });

  it('renders a date-only value as midnight UTC instead of crashing', () => {
    renderDateTime('2026-03-04');

    expect(screen.getByText('Mar 3, 2026 19:00')).toBeInTheDocument();
    expect(screen.getByText('EST')).toBeInTheDocument();
  });

  it('renders nothing for a malformed value instead of crashing', () => {
    const { container } = renderDateTime('not a date');

    expect(container.textContent).toBe('');
    expect(screen.queryByText('EST')).not.toBeInTheDocument();
  });
});
