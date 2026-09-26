const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 10_000;

export class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery is temporarily unavailable");
    this.name = "EmailDeliveryError";
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EmailDeliveryError();
  return value;
}

export async function sendSignupVerificationEmail(
  recipient: string,
  code: string,
): Promise<void> {
  const apiKey = requiredEnvironmentValue("BREVO_API_KEY");
  const senderEmail = requiredEnvironmentValue("BREVO_SENDER_EMAIL");
  const senderName = requiredEnvironmentValue("BREVO_SENDER_NAME");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: recipient }],
        subject: "Your Envelo verification code",
        textContent: [
          `Your Envelo signup code is: ${code}`,
          "",
          "This code expires in 10 minutes. If you did not try to create an Envelo account, you can ignore this email.",
        ].join("\n"),
        htmlContent: [
          "<p>Your Envelo signup code is:</p>",
          `<p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">${code}</p>`,
          "<p>This code expires in 10 minutes. If you did not try to create an Envelo account, you can ignore this email.</p>",
        ].join(""),
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new EmailDeliveryError();
  } catch (error: unknown) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  } finally {
    clearTimeout(timeout);
  }
}
