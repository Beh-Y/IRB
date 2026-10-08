/* Test-only REAL email notifications via EmailJS (emailjs.com) -- a
 * client-side email-sending service, which fits this app's static/no-
 * backend constraint (unlike a transactional API like Resend, EmailJS's
 * Public Key is meant to be exposed in browser code -- its abuse
 * protection is domain-restriction/rate-limiting on their end, not
 * secrecy, so there's no key-exposure problem to solve with a backend
 * here).
 *
 * This is separate from, and in addition to, the simulated in-app Outbox
 * (see js/email.js): the Outbox is a permanent, always-on stand-in for
 * every action across every role, with each role getting its own
 * placeholder address. This only fires for the handful of "now pending on
 * someone else" transitions below, and every one of these emails lands in
 * the single test inbox connected to the EmailJS Service, regardless of
 * which role would receive it in a real system -- it exists to prove the
 * send mechanism itself actually reaches a real inbox, not to demonstrate
 * per-role routing (the Outbox already does that).
 *
 * Fill these in from your EmailJS dashboard:
 * - Service ID: Email Services -> your connected Gmail service
 * - Template ID: Email Templates -> your template
 * - Public Key: Account (top right) -> API Keys
 */
const EMAILJS_PUBLIC_KEY = 'HTwjRMzQ4kQGGRKdj';
const EMAILJS_SERVICE_ID = 'service_blos6xn';
const EMAILJS_TEMPLATE_ID = 'template_fzr3hd7';

if (typeof emailjs !== 'undefined') {
  emailjs.init(EMAILJS_PUBLIC_KEY);
}

/* Every in-flight EmailJS request, so a caller about to redirect (see
 * goToDashboardWithMessage in form-utils.js) can await them first --
 * without this, the browser cancels the request mid-flight when
 * window.location changes right after Submit. */
const pendingEmailSends = [];

/* How long the redirect will wait on one email send before giving up on
 * it. A failed request (bad ID, offline, blocked) still rejects and
 * resolves quickly via the .catch below -- this is only for a request
 * that neither resolves nor rejects at all (some proxies/firewalls just
 * drop a blocked connection silently instead of refusing it), which would
 * otherwise hang the whole page on Submit forever, since nothing left to
 * await it after a fresh navigation abandons the wait. */
const EMAIL_SEND_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => {
      console.warn(`EmailJS notification timed out after ${ms}ms -- proceeding without waiting further.`);
      resolve();
    }, ms)),
  ]);
}

/* Sends one real test email via EmailJS. { form_type, ref_number,
 * form_link, message } are the template params -- use them as
 * {{form_type}}, {{ref_number}}, {{form_link}}, {{message}} placeholders
 * in the EmailJS template's Subject/Body (subject is also passed through,
 * for a template that wants a dynamic {{subject}} too). Logs rather than
 * throwing on failure (an unfilled placeholder ID, or the test inbox
 * being unreachable) -- this is a notification about the action that just
 * happened, not the action itself, so it should never block or roll back
 * a real workflow step (Submit, Route, Return) that already saved. */
function sendEmailNotification({ subject, message, formType, refNumber, formLink }) {
  if (typeof emailjs === 'undefined') {
    console.error('EmailJS SDK not loaded -- notification not sent.');
    return;
  }
  const send = emailjs
    .send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      subject,
      form_type: formType,
      ref_number: refNumber,
      form_link: formLink,
      message,
    })
    .catch((err) => console.error('EmailJS notification failed:', err));
  pendingEmailSends.push(withTimeout(send, EMAIL_SEND_TIMEOUT_MS));
}
