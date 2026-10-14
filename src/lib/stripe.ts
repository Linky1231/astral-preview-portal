/**
 * Stripe client — Asternal
 *
 * Inicializa Stripe con la publishable key del entorno.
 * Como la app no tiene backend, usamos Stripe Buy Button
 * (Embedded Checkout) y Payment Links para suscripciones.
 *
 * Para configurar:
 *   1. Crea un Buy Button en dashboard.stripe.com → Productos → Buy Button
 *   2. Copia el buy-button-id y pégalo en la página Plus (`plus.tsx`)
 *   3. Agrega tu publishable key en API Keys / .env:
 *      VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxx
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";

let _stripePromise: Promise<Stripe | null> | null = null;

/**
 * Devuelve una promesa con la instancia de Stripe.
 * Usa `import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY`.
 */
export function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    const key =
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      "pk_test_51RK4ggFTesVtHowJmcCePIAMnhNx3RH7oucLsPZQetXDHWbsz1N4yHjhiLjcwMeyyHhuqI3O2WgfFn1qx8ARYAj100kKXSeiwb";
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

/**
 * Carga el script del Stripe Buy Button si no está ya presente.
 * El Buy Button se renderiza como <stripe-buy-button> en el DOM.
 */
export function loadBuyButtonScript(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]')) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/buy-button.js";
    s.async = true;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}
