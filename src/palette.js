// Kiln Yard look plan, in one place. Dusk brickworks: warm ember orange against
// cool ash slate-blue, on dark brick and concrete. The same names are the CSS
// custom properties in index.html; no other colour appears in the game code.
// Palette: canvas (dusk haze), surface (brick), hairline (mortar lines),
// ink (warm off-white), muted (dusty grey), accent (ember orange),
// ash (defender slate-blue), furnace (kiln glow).
export const PALETTE = {
  canvas: '#17130f',
  surface: '#241c16',
  hairline: '#3a2f26',
  ink: '#f2ead9',
  muted: '#9a8d7c',
  accent: '#ff8c2e',
  ash: '#5b7a99',
  furnace: '#ff5a1f',
};

export function shade(name) {
  return PALETTE[name];
}
