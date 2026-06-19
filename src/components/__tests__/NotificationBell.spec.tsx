/* trunk-ignore-all(prettier) */
import React from 'react';
import { render, act } from '@testing-library/react';

let authUser: { user: { id: string } | null } = { user: { id: 'user1' } };

jest.mock('@/src/contexts/AuthContext', () => ({
  useAuth: () => authUser,
}));

jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

jest.mock('@/src/contexts/ThemeContext', () => ({
  useAppColors: () => ({
    text: '#000',
    textSub: '#444',
    surface: '#fff',
    surfaceAlt: '#f7f7f7',
    border: '#ddd',
    iconTint: '#000',
    iconBg: '#eee',
    tint: '#000',
  }),
}));

jest.mock('@/src/contexts/WebStudyReminderContext', () => ({
  useWebStudyReminderState: () => ({
    dailyDue: true,
    dailyReminderId: 'study-daily-user1',
    queuedReminders: [
      { id: 'queued-1', title: 'Queued', body: 'Body', kind: 'daily' },
    ],
    dismissDailyForToday: jest.fn(),
    dismissBellItem: jest.fn(),
  }),
}));

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(async () => ({ data: [] })),
    channel: jest.fn(() => ({
      on: jest.fn(() => ({ subscribe: jest.fn(() => ({}) ) })),
    })),
    removeChannel: jest.fn(),
  },
}));

jest.mock('react-native', () => {
  const React = require('react');
  
  const createMockComponent = (name: string, domTag = 'div') => {
    const Component = React.forwardRef(({ children, style, activeOpacity, animationType, onRequestClose, statusBarTranslucent, transparent, visible, hitSlop, showsVerticalScrollIndicator, extraData, keyExtractor, renderItem, data, numberOfLines, ...props }: any, ref: any) => {
      const cleanProps: any = {
        style,
        ref,
        'data-rn-component': name,
        ...props,
      };

      if (props.onPress) {
        cleanProps.onClick = props.onPress;
        delete cleanProps.onPress;
      }

      return React.createElement(domTag, cleanProps, children);
    });
    Component.displayName = name;
    return Component;
  };

  return {
    View: createMockComponent('View', 'div'),
    Text: createMockComponent('Text', 'span'),
    TouchableOpacity: createMockComponent('TouchableOpacity', 'button'),
    Modal: createMockComponent('Modal', 'div'),
    FlatList: ({ data, renderItem, keyExtractor, style }: any) => {
      const React = require('react');
      if (!data) return null;
      return React.createElement('div', { style, 'data-rn-component': 'FlatList' },
        data.map((item: any, index: number) => {
          const key = keyExtractor ? keyExtractor(item, index) : index.toString();
          return React.createElement('div', { key }, renderItem({ item, index }));
        })
      );
    },
    StyleSheet: {
      create: (styles: any) => styles,
    },
    Platform: { OS: 'web' },
    Pressable: createMockComponent('Pressable', 'div'),
    ActivityIndicator: createMockComponent('ActivityIndicator', 'div'),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Feather: ({ name, size, color }: any) =>
      React.createElement('span', {
        'data-rn-component': 'Feather',
        'data-name': name,
        'data-size': size,
        'data-color': color,
      }),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const NotificationBell = require('../NotificationBell').default;

describe('NotificationBell', () => {
  it('renders null when there is no authenticated user', () => {
    authUser = { user: null };
    const { container } = render(React.createElement(NotificationBell, null));
    expect(container.firstChild).toBeNull();
  });

  it('renders bell items when user is authenticated', async () => {
    authUser = { user: { id: 'user1' } };
    let container: HTMLElement | null = null;
    await act(async () => {
      const result = render(React.createElement(NotificationBell, null));
      container = result.container;
    });
    // Компонент відрендерено
    expect(container).not.toBeNull();
    expect(container!.firstChild).not.toBeNull();
    // Перевіряємо наявність queued reminder з моку
    expect(container!.textContent).toContain('Queued');
  });
});