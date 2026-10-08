// Public operator facts: supplied by each church, never guessed from a backend URL.
export const PRIVACY = {
  controller: process.env.NEXT_PUBLIC_BEACON_CONTROLLER?.trim() || '',
  contact: process.env.NEXT_PUBLIC_BEACON_PRIVACY_CONTACT?.trim() || '',
  hosting: process.env.NEXT_PUBLIC_BEACON_HOSTING_DETAILS?.trim() || '',
};
