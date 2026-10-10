/** Scene coordinates are all in the same 768 × 1152 world as the background. */
export const SCENE = Object.freeze({
  worldWidth: 768,
  worldHeight: 1152,
  floorY: 1075,
  catMinX: 62,
  catMaxX: 706,
  catStartX: 180,
  librarianRenderHeight: 250,
  facingVelocityThreshold: 2,
  catRenderHeight: 85,
  // Replace these points with measured foot-contact positions for another background.
  stairWaypoints: [
    { x: 566, y: 264 },
    { x: 481, y: 333 },
    { x: 534, y: 414 },
    { x: 426, y: 501 },
    { x: 483, y: 604 },
    { x: 354, y: 711 },
  ],
  rescueHumanFeetY: 1050,
  landingMinX: 170,
  landingMaxX: 600,
  landingMarkerY: 1095,
});

export const TIMING = Object.freeze({
  countdownSeconds: 1.65,
  trackingSeconds: 10.5,
  slipSeconds: 1.2,
  rescueEarliestProgress: 0.6,
  rescueRadius: 98,
  jumpSeconds: 0.6,
  contactSeconds: 0.72,
  recoverySeconds: 2.7,
  flashSeconds: 0.14,
  horizontalFeint: 28,
});

/** Leave operational links unset until the library escape-room provides them. */
export const INTEGRATION = Object.freeze({
  nextSceneUrl: null,
  escapeCode: null,
});
