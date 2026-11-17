/**
 * The single-file web preview inlines the font as a data URI (window.BLS_FONT) so the page needs
 * no other files; the normal web dev server loads the asset file.
 */
const inlined = (globalThis as { BLS_FONT?: string }).BLS_FONT;

export const fontSources = {
  DelaGothicOne: inlined ?? require('../assets/fonts/DelaGothicOne-Latin.ttf'),
};
