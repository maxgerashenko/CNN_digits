// The values that change between places the app runs. Nothing else in the
// app reads import.meta.env.

/**
 * Address of the training server (the Hugging Face Space), without a slash
 * at the end. Empty until the Space exists: the app then shows "Training is
 * not set up yet" and never calls the network.
 * Set it with VITE_TRAINING_SERVER_URL (web/.env.local, or a repository
 * variable in the GitHub Pages workflow).
 */
export const TRAINING_SERVER_URL: string = String(import.meta.env.VITE_TRAINING_SERVER_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

/**
 * Where the saved model lives: web/public/model/model.json + weights.bin,
 * written by `python server/export.py MODEL.keras web/public/model`.
 * Until the two files are added the app shows "The saved model is not added yet".
 */
export const SAVED_MODEL_URL: string = `${import.meta.env.BASE_URL}model/model.json`;

/**
 * Measured results of the saved model on the 10,000 MNIST test images
 * (README.md, "Best result so far"). The app uses them as the goal line and
 * as the "ideal" column. Update them when a different saved model is exported.
 */
export const SAVED_MODEL_FACTS = {
  testAccuracy: 0.9953,
  mistakes: 47,
  testImages: 10000,
} as const;

/**
 * Google Tag Manager container ID (looks like GTM-XXXXXXX). The Google
 * Analytics tag lives inside this container, set up on tagmanager.google.com.
 * VITE_GTM_ID overrides the default; set it to "off" to load nothing.
 */
export const GTM_ID: string = (() => {
  const raw = import.meta.env.VITE_GTM_ID;
  const id = String(raw === undefined || raw === '' ? 'GTM-5W55NZQZ' : raw).trim();
  return /^GTM-[A-Z0-9]+$/.test(id) ? id : '';
})();
