/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Values are direct hex conversions of the sibling web app's HSL variables.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#020817',
    tint: '#0F172A',

    // Core surfaces
    background: '#ffffff',
    foreground: '#020817',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#020817',

    // Primary action color (buttons, links, active states)
    primary: '#0F172A',
    primaryForeground: '#F8FAFC',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#F1F5F9',
    secondaryForeground: '#0F172A',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#F1F5F9',
    mutedForeground: '#64748B',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#F1F5F9',
    accentForeground: '#0F172A',

    // Destructive actions (delete, error states)
    destructive: '#EF4444',
    destructiveForeground: '#F8FAFC',

    // Borders and input outlines
    border: '#E2E8F0',
    input: '#E2E8F0',
  },
  dark: {
    text: '#F8FAFC',
    tint: '#F8FAFC',
    background: '#020817',
    foreground: '#F8FAFC',
    card: '#020817',
    cardForeground: '#F8FAFC',
    primary: '#F8FAFC',
    primaryForeground: '#0F172A',
    secondary: '#1E293B',
    secondaryForeground: '#F8FAFC',
    muted: '#1E293B',
    mutedForeground: '#94A3B8',
    accent: '#1E293B',
    accentForeground: '#F8FAFC',
    destructive: '#7F1D1D',
    destructiveForeground: '#F8FAFC',
    border: '#1E293B',
    input: '#1E293B',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
