/*
 Apply the saved theme before first paint.

 React sets data-theme on mount, which is too late: someone who chose light
 while their OS is dark would see a flash of dark first. This loads as a
 blocking script in <head>, so the correct ground is painted immediately.

 It is a file rather than an inline <script> because the Content-Security-Policy
 in firebase.json allows no inline script at all. That rule is what stops an
 injected script from reading the Gemini key in localStorage.
*/
try {
  var t = localStorage.getItem('theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch {
  /* Private windows throw on localStorage; system preference is a fine default. */
}
