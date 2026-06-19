const tintColorLight = '#4255ff';
const tintColorDark = '#a7b6f7';

export default {
  light: {
    text: '#111827',
    /** App screen background — avoids "all white" in light mode */
    background: '#f3f4f6',
    /** Cards / sheets on top of screen */
    surface: '#ffffff',
    /** Top navigation header */
    header: '#f5f7ff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#edf4fe',
    background: '#151c2e',
    surface: '#1d2a3a',
    /** Top navigation header — slightly lighter than surface */
    header: '#243040',
    tint: tintColorDark,
    tabIconDefault: '#9ca3af',
    tabIconSelected: tintColorDark,
  },
};

