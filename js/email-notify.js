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
const EMAILJS_PUBLIC_KEY = 'PASTE_EMAILJS_PUBLIC_KEY';
const EMAILJS_SERVICE_ID = 'PASTE_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'PASTE_EMAILJS_TEMPLATE_ID';

if (typeof emailjs !== 'undefined') {
  emailjs.init(EMAILJS_PUBLIC_KEY);
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
  emailjs
    .send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      subject,
      form_type: formType,
      ref_number: refNumber,
      form_link: formLink,
      message,
    })
    .catch((err) => console.error('EmailJS notification failed:', err));
}
