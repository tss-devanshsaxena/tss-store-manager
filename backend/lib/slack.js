const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'thesouledstore.com').toLowerCase();

function isSouledStoreEmail(email) {
  const normalized = String(email || '').toLowerCase().trim();
  return normalized.endsWith(`@${ALLOWED_DOMAIN}`);
}

async function slackPost(method, payload, useForm = false) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('Slack is not configured');

  const { default: fetch } = await import('node-fetch');
  const headers = { Authorization: `Bearer ${token}` };

  let body;
  if (useForm) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(payload).toString();
  } else {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    body = JSON.stringify(payload);
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers,
    body,
  });

  return res.json();
}

async function lookupSlackUser(email) {
  const lookup = await slackPost('users.lookupByEmail', { email }, true);
  if (!lookup.ok) {
    if (lookup.error === 'users_not_found') {
      throw new Error('No Slack account found for this email. Use your @thesouledstore.com Slack login.');
    }
    throw new Error(lookup.error || 'Slack lookup failed');
  }
  return lookup.user;
}

async function sendSlackDm(email, text) {
  const user = await lookupSlackUser(email);
  const message = await slackPost('chat.postMessage', {
    channel: user.id,
    text,
    username: 'MrSoul',
  });

  if (!message.ok) {
    throw new Error(message.error || 'Failed to send Slack message');
  }
}

async function sendOtpToSlack(email, otp) {
  await sendSlackDm(
    email,
    `*MrSoul* — TSS Store Dashboard\n\nYour login code is: *${otp}*\n\nThis code expires in 10 minutes. If you did not request this, ignore this message.`
  );
}

async function sendPendingAccessToAdmin(adminEmail, requesterEmail, otp) {
  const displayName = requesterEmail.split('@')[0].replace(/\./g, ' ');
  await sendSlackDm(
    adminEmail,
    `*MrSoul* — TSS Store Dashboard access request\n\n` +
      `*${requesterEmail}* (${displayName}) tried to sign in but is not onboarded yet.\n\n` +
      `*OTP for first-time onboarding:* \`${otp}\`\n\n` +
      `Share this OTP with them so they can complete their first login. ` +
      `After that, they will receive OTPs directly on Slack.`
  );
}

module.exports = {
  isSouledStoreEmail,
  sendOtpToSlack,
  sendPendingAccessToAdmin,
  ALLOWED_DOMAIN,
};
