import React, { useEffect } from 'react';
import { render, act } from '@testing-library/react';

const mockGetItem = jest.fn(async () => JSON.stringify({ srsDayStartHour: 5 }));
const mockSetItem = jest.fn(async () => null);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
  },
}));

const { StudySettingsProvider, useStudySettings } = require('../StudySettingsContext');

describe('StudySettingsContext', () => {
  it('throws when consumed outside the provider', () => {
    function Consumer() {
      useStudySettings();
      return null;
    }

    expect(() => {
      render(React.createElement(Consumer, null));
    }).toThrow('useStudySettings must be used within StudySettingsProvider');
  });

  it('loads settings from storage and updates them', async () => {
    let captured: any = null;

    function Consumer() {
      const state = useStudySettings();
      useEffect(() => {
        captured = state;
      }, [state]);
      return null;
    }

    await act(async () => {
      render(
        React.createElement(StudySettingsProvider, null,
          React.createElement(Consumer, null),
        ),
      );
      await Promise.resolve();
    });

    expect(captured).not.toBeNull();
    expect(captured.settings.srsDayStartHour).toBe(5);

    await act(async () => {
      await captured.updateSettings({ srsDayStartHour: 10 });
      await Promise.resolve();
    });

    expect(mockSetItem).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"srsDayStartHour":10'));
  });
});