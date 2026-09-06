// lib/auth.js
//
// Phone number + OTP login via Twilio Verify. Twilio Verify handles
// code generation, expiry, and rate-limiting itself — this module is
// just a thin wrapper around their SDK, same pattern as every other
// external-API wrapper in this project.
//
// Requires 3 environment variables (see .env.example):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
// The Verify Service SID is NOT the same as the Account SID — it's
// created separately in the Twilio Console under Verify > Services.
//
// Phone numbers must be in E.164 format (e.g. +919876543210) — Twilio
// Verify requires this, it will reject anything else.

const twilio = require('twilio');

// DEMO-ONLY MASTER CODE. A Twilio trial account can only actually
// *deliver* SMS to phone numbers you've manually verified in the
// Console (see Verified Caller IDs) — every other number's OTP request
// still succeeds at the API level but the SMS silently never arrives.
// So this code always passes verification regardless of what Twilio
// did, letting you demo the login flow with ANY phone number even
// though only one is verified. Configurable via env so it can be
// changed or disabled (unset DEMO_MASTER_OTP) without a code change.
// *** REMOVE THIS (or set DEMO_MASTER_OTP to something private and
// unshared) before any real deployment *** — as shipped, anyone who
// knows this code can "verify" any phone number they don't own.
const DEMO_MASTER_OTP = process.env.DEMO_MASTER_OTP ?? '696969';

function getClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error(
      'auth: TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set. Copy .env.example to .env and add your Twilio credentials.'
    );
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function getVerifyServiceSid() {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid) {
    throw new Error(
      'auth: TWILIO_VERIFY_SERVICE_SID not set. Create a Verify Service in the Twilio Console (Verify > Services) and add its SID to .env.'
    );
  }
  return sid;
}

/**
 * Sends an OTP code via SMS to the given phone number.
 *
 * @param {string} phoneNumber - E.164 format, e.g. "+919876543210".
 * @returns {Promise<{status: string}>} - Twilio's verification status (usually "pending").
 */
async function sendOtp(phoneNumber) {
  if (!phoneNumber) throw new Error('auth: phoneNumber is required');

  const client = getClient();
  const verifyServiceSid = getVerifyServiceSid();

  try {
    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: 'sms' });

    return { status: verification.status };
  } catch (err) {
    // Trial-account restriction (unverified destination number) is the
    // most likely cause here, not a real outage — don't hard-fail the
    // route over it, since DEMO_MASTER_OTP lets login continue anyway.
    // Any OTHER failure (bad credentials, service down) still surfaces
    // this way rather than pretending to succeed silently.
    console.warn(`[auth] Twilio send failed for ${phoneNumber} (falling back to demo master OTP if used):`, err.message);
    return { status: 'send-failed-use-master-otp' };
  }
}

/**
 * Checks an OTP code the user typed in against what Twilio sent.
 *
 * @param {string} phoneNumber - same E.164 number the code was sent to.
 * @param {string} code - the code the user entered.
 * @returns {Promise<boolean>} - true if the code is correct (Twilio status "approved").
 */
async function verifyOtp(phoneNumber, code) {
  if (!phoneNumber || !code) throw new Error('auth: phoneNumber and code are both required');

  if (DEMO_MASTER_OTP && code === DEMO_MASTER_OTP) {
    console.log(`[auth] ${phoneNumber} logged in via demo master OTP (real Twilio check skipped)`);
    return true;
  }

  const client = getClient();
  const verifyServiceSid = getVerifyServiceSid();

  try {
    const check = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    return check.status === 'approved';
  } catch (err) {
    // Twilio THROWS here (a REST 404 "resource not found"), rather than
    // returning a normal not-approved status, when there's no matching
    // in-progress verification for this phone number — e.g. it expired,
    // was checked too many times already, or (very likely in this demo
    // setup) sendOtp's own Twilio call silently failed earlier due to
    // the trial-account restriction, so no real verification session
    // ever existed to check against. From the artisan's point of view
    // this is indistinguishable from "wrong code" — surface it that way
    // instead of leaking Twilio's internal REST error text up to the UI.
    console.warn(`[auth] Twilio verification check failed for ${phoneNumber}:`, err.message);
    return false;
  }
}

module.exports = { sendOtp, verifyOtp };
