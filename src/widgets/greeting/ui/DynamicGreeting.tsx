import React, { useMemo } from 'react';
import { useTranslation } from '../../../shared/lib/i18n';
import { useSession } from '../../../entities/session/model/session-context';
import './DynamicGreeting.css';

function getGreetingKey(hour: number): 'greeting_morning' | 'greeting_afternoon' | 'greeting_evening' | 'greeting_night' {
  if (hour >= 5 && hour < 12) return 'greeting_morning';
  if (hour >= 12 && hour < 18) return 'greeting_afternoon';
  if (hour >= 18 && hour < 23) return 'greeting_evening';
  return 'greeting_night';
}

function formatLocalDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export const DynamicGreeting: React.FC = () => {
  const { messages } = useTranslation();
  const { session } = useSession();

  const { greetingText, dateText } = useMemo(() => {
    const hour = new Date().getHours();
    const key = getGreetingKey(hour);
    const base = messages.home[key];
    const name = session.is_authenticated && session.user?.username
      ? `, ${session.user.username}`
      : '';
    return {
      greetingText: `${base}${name}`,
      dateText: formatLocalDate(),
    };
  }, [messages, session]);

  return (
    <div className="dynamic-greeting animate-cascade" style={{ animationDelay: '0ms' }}>
      <h1 className="dynamic-greeting__title">
        {greetingText}
      </h1>
      <p className="dynamic-greeting__date">{dateText}</p>
    </div>
  );
};
